"""
OmniRC Protocol Decoder
Decodificador universal para todos os protocolos do OmniRC:
- Binários de Aeromodelismo: CRSF (ExpressLRS/Crossfire), SBUS, IBUS, MAVLink, MSP
- Comandos Textuais: AERO, DRIVE, TANK, ARM, MODE, GIMBAL, SENSOR, FLAPS, GEAR, CH
- Controles Personalizados: SLIDER, BTN, TOGGLE, CUSTOM
- JSON e Fallbacks de RC clássico
"""

import json
import re

def is_hex_string(text):
    clean = text.replace(" ", "").replace(":", "").replace("-", "")
    if len(clean) >= 6 and len(clean) % 2 == 0:
        return all(c in "0123456789abcdefABCDEF" for c in clean)
    return False

def parse_hex_to_bytes(text):
    clean = re.sub(r"[^0-9a-fA-F]", "", text)
    if len(clean) % 2 == 0 and len(clean) > 0:
        try:
            return bytes.fromhex(clean)
        except Exception:
            pass
    return None

def decode_crsf(data):
    """
    CRSF Frame: [Sync 0xC8] [Len 24] [Type 0x16] [Payload 22 bytes (16x11bit)] [CRC8]
    Total = 26 bytes
    """
    if len(data) >= 26 and data[0] in (0xC8, 0xEE, 0xEA) and data[2] == 0x16:
        payload = data[3:25]
        channels_11bit = []
        bit_buf = 0
        bits_in_buf = 0
        idx = 0
        for _ in range(16):
            while bits_in_buf < 11 and idx < len(payload):
                bit_buf |= (payload[idx] << bits_in_buf)
                bits_in_buf += 8
                idx += 1
            val = bit_buf & 0x7FF
            bit_buf >>= 11
            bits_in_buf -= 11
            channels_11bit.append(val)

        # Scale 172 (988us), 992 (1500us), 1811 (2012us)
        channels_us = []
        for val in channels_11bit:
            us = 988 + int((val - 172) * (2012 - 988) / (1811 - 172))
            channels_us.append(max(988, min(2012, us)))
        return channels_us
    return None

def decode_sbus(data):
    """
    SBUS Frame: [0x0F] [22 bytes payload (16x11bit)] [Flags] [0x00]
    Total = 25 bytes
    """
    if len(data) >= 25 and data[0] == 0x0F and data[24] == 0x00:
        payload = data[1:23]
        channels_11bit = []
        bit_buf = 0
        bits_in_buf = 0
        idx = 0
        for _ in range(16):
            while bits_in_buf < 11 and idx < len(payload):
                bit_buf |= (payload[idx] << bits_in_buf)
                bits_in_buf += 8
                idx += 1
            val = bit_buf & 0x7FF
            bit_buf >>= 11
            bits_in_buf -= 11
            channels_11bit.append(val)

        channels_us = []
        for val in channels_11bit:
            us = 1000 + int((val - 172) * 1000 / (1811 - 172))
            channels_us.append(max(988, min(2012, us)))
        return channels_us
    return None

def decode_ibus(data):
    """
    IBUS Frame: [0x20 0x40] [14 x uint16 LE (1000..2000us)] [Checksum uint16 LE]
    Total = 32 bytes
    """
    if len(data) >= 32 and data[0] == 0x20 and data[1] == 0x40:
        channels_us = []
        for i in range(14):
            us = data[2 + i * 2] | (data[3 + i * 2] << 8)
            channels_us.append(max(988, min(2012, us)))
        while len(channels_us) < 16:
            channels_us.append(1500)
        return channels_us
    return None

def decode_mavlink(data):
    """
    MAVLink v1 RC_CHANNELS_OVERRIDE (MsgId 70): [0xFE] [Len 18] [Seq] [Sys] [Comp] [MsgId 70] [8x uint16 LE] ... [CRC 2]
    """
    if len(data) >= 26 and data[0] == 0xFE and data[5] == 70:
        payload = data[6:24]
        channels_us = []
        for i in range(8):
            us = payload[i * 2] | (payload[i * 2 + 1] << 8)
            channels_us.append(max(988, min(2012, us)))
        while len(channels_us) < 16:
            channels_us.append(1500)
        return channels_us
    return None

def decode_msp(data):
    """
    MSP v1 MSP_SET_RAW_RC (Cmd 200): ['$M<'] [Len 16] [Cmd 200] [8x uint16 LE] [CRC]
    """
    if len(data) >= 22 and data[0:3] == b"$M<" and data[4] == 200:
        payload = data[5:21]
        channels_us = []
        for i in range(8):
            us = payload[i * 2] | (payload[i * 2 + 1] << 8)
            channels_us.append(max(988, min(2012, us)))
        while len(channels_us) < 16:
            channels_us.append(1500)
        return channels_us
    return None

def channels_to_aero(channels):
    """
    Converte lista de canais em microssegundos para dicionário de controle de voo.
    Assumindo padrão AETR:
    CH1: Aileron/Roll (1000..2000 -> -100..100)
    CH2: Elevator/Pitch (1000..2000 -> -100..100)
    CH3: Throttle (1000..2000 -> 0..100)
    CH4: Rudder/Yaw (1000..2000 -> -100..100)
    CH5: AUX1 (ARM: >1500 = Armed)
    CH6: AUX2 (Mode: <1300 Manual, 1300..1700 Angle/Stab, >1700 RTH)
    CH7: AUX3 (Flaps: 0..100%)
    CH8: AUX4 (Gear: >1500 Up, <=1500 Down)
    """
    ch1 = channels[0] if len(channels) > 0 else 1500
    ch2 = channels[1] if len(channels) > 1 else 1500
    ch3 = channels[2] if len(channels) > 2 else 1000
    ch4 = channels[3] if len(channels) > 3 else 1500
    ch5 = channels[4] if len(channels) > 4 else 1000
    ch6 = channels[5] if len(channels) > 5 else 1000
    ch7 = channels[6] if len(channels) > 6 else 1000
    ch8 = channels[7] if len(channels) > 7 else 1000

    roll = int(round((ch1 - 1500) / 5.0))
    pitch = int(round((ch2 - 1500) / 5.0))
    throttle = max(0, min(100, int(round((ch3 - 1000) / 10.0))))
    yaw = int(round((ch4 - 1500) / 5.0))

    armed = ch5 > 1500
    if ch6 < 1300:
        mode = "MANUAL / ACRO"
    elif ch6 <= 1700:
        mode = "ANGLE / STAB"
    else:
        mode = "RTH / AUTO"

    flaps = max(0, min(100, int(round((ch7 - 1000) / 10.0))))
    gear = ch8 > 1500

    return {
        "roll": max(-100, min(100, roll)),
        "pitch": max(-100, min(100, pitch)),
        "throttle": throttle,
        "yaw": max(-100, min(100, yaw)),
        "armed": armed,
        "mode": mode,
        "flaps": flaps,
        "gear": gear
    }

def decode_packet(raw):
    """
    Entrada: bytes ou str.
    Retorno: dict com dados estruturados do pacote.
    """
    data_bytes = None
    raw_str = ""

    if isinstance(raw, bytes):
        data_bytes = raw
        try:
            raw_str = raw.decode("utf-8").strip()
        except UnicodeDecodeError:
            raw_str = raw.hex(" ")
    elif isinstance(raw, str):
        raw_str = raw.strip()
        if is_hex_string(raw_str):
            data_bytes = parse_hex_to_bytes(raw_str)
        else:
            data_bytes = raw_str.encode("utf-8")

    # 1. Tentar decodificar binários de aeromodelos
    if data_bytes and len(data_bytes) >= 10:
        # CRSF
        channels = decode_crsf(data_bytes)
        if channels:
            aero = channels_to_aero(channels)
            return {
                "protocol": "CRSF",
                "type": "aero",
                "channels": channels,
                "aero": aero,
                "summary": f"[CRSF/ELRS] Roll:{aero['roll']}% Pitch:{aero['pitch']}% Thr:{aero['throttle']}% Yaw:{aero['yaw']}% | ARM:{'SIM' if aero['armed'] else 'NÃO'} Modo:{aero['mode']}"
            }

        # SBUS
        channels = decode_sbus(data_bytes)
        if channels:
            aero = channels_to_aero(channels)
            return {
                "protocol": "SBUS",
                "type": "aero",
                "channels": channels,
                "aero": aero,
                "summary": f"[SBUS] Roll:{aero['roll']}% Pitch:{aero['pitch']}% Thr:{aero['throttle']}% Yaw:{aero['yaw']}% | ARM:{'SIM' if aero['armed'] else 'NÃO'} Modo:{aero['mode']}"
            }

        # IBUS
        channels = decode_ibus(data_bytes)
        if channels:
            aero = channels_to_aero(channels)
            return {
                "protocol": "IBUS",
                "type": "aero",
                "channels": channels,
                "aero": aero,
                "summary": f"[IBUS] Roll:{aero['roll']}% Pitch:{aero['pitch']}% Thr:{aero['throttle']}% Yaw:{aero['yaw']}% | ARM:{'SIM' if aero['armed'] else 'NÃO'} Modo:{aero['mode']}"
            }

        # MAVLink
        channels = decode_mavlink(data_bytes)
        if channels:
            aero = channels_to_aero(channels)
            return {
                "protocol": "MAVLINK",
                "type": "aero",
                "channels": channels,
                "aero": aero,
                "summary": f"[MAVLink] Roll:{aero['roll']}% Pitch:{aero['pitch']}% Thr:{aero['throttle']}% Yaw:{aero['yaw']}% | ARM:{'SIM' if aero['armed'] else 'NÃO'} Modo:{aero['mode']}"
            }

        # MSP
        channels = decode_msp(data_bytes)
        if channels:
            aero = channels_to_aero(channels)
            return {
                "protocol": "MSP",
                "type": "aero",
                "channels": channels,
                "aero": aero,
                "summary": f"[MSP/INAV] Roll:{aero['roll']}% Pitch:{aero['pitch']}% Thr:{aero['throttle']}% Yaw:{aero['yaw']}% | ARM:{'SIM' if aero['armed'] else 'NÃO'} Modo:{aero['mode']}"
            }

    # 2. JSON
    if raw_str.startswith("{") and raw_str.endswith("}"):
        try:
            js = json.loads(raw_str)
            return {
                "protocol": "JSON",
                "type": "json",
                "json": js,
                "summary": f"[JSON] {raw_str}"
            }
        except Exception:
            pass

    # 3. Comandos delimitados por vírgula / espaço / dois-pontos
    tokens = re.split(r"[,:\s]+", raw_str)
    cmd = tokens[0].upper() if tokens else ""

    # AERO / DRONE / PLANE / HELI
    if cmd in ("AERO", "DRONE", "PLANE", "HELI"):
        roll = int(tokens[1]) if len(tokens) > 1 and tokens[1].lstrip("-").isdigit() else 0
        pitch = int(tokens[2]) if len(tokens) > 2 and tokens[2].lstrip("-").isdigit() else 0
        throttle = int(tokens[3]) if len(tokens) > 3 and tokens[3].lstrip("-").isdigit() else 0
        yaw = int(tokens[4]) if len(tokens) > 4 and tokens[4].lstrip("-").isdigit() else 0
        aero = {
            "roll": max(-100, min(100, roll)),
            "pitch": max(-100, min(100, pitch)),
            "throttle": max(0, min(100, throttle)),
            "yaw": max(-100, min(100, yaw)),
            "armed": throttle > 5,
            "mode": "ANGLE / STAB",
            "flaps": 0,
            "gear": False
        }
        # Converter para canais us
        channels = [
            1500 + aero["roll"] * 5,
            1500 + aero["pitch"] * 5,
            1000 + aero["throttle"] * 10,
            1500 + aero["yaw"] * 5,
            2000 if aero["armed"] else 1000,
            1500, 1000, 1000
        ] + [1500] * 8
        return {
            "protocol": "TEXT_AERO",
            "type": "aero",
            "channels": channels,
            "aero": aero,
            "summary": f"[{cmd}] R:{roll}% P:{pitch}% Thr:{throttle}% Y:{yaw}%"
        }

    # DRIVE (carro RC / rover)
    if cmd == "DRIVE":
        x = int(tokens[1]) if len(tokens) > 1 and tokens[1].lstrip("-").isdigit() else 0
        y = int(tokens[2]) if len(tokens) > 2 and tokens[2].lstrip("-").isdigit() else 0
        left = max(-100, min(100, y + x))
        right = max(-100, min(100, y - x))
        return {
            "protocol": "TEXT_DRIVE",
            "type": "drive",
            "drive": {"steering": x, "throttle": y, "left": left, "right": right},
            "summary": f"[DRIVE] Volante:{x}% Acelerador:{y}% (Esq:{left}% Dir:{right}%)"
        }

    # TANK (esteiras)
    if cmd == "TANK":
        l = int(tokens[1]) if len(tokens) > 1 and tokens[1].lstrip("-").isdigit() else 0
        r = int(tokens[2]) if len(tokens) > 2 and tokens[2].lstrip("-").isdigit() else 0
        return {
            "protocol": "TEXT_TANK",
            "type": "drive",
            "drive": {"steering": (l - r) // 2, "throttle": (l + r) // 2, "left": l, "right": r},
            "summary": f"[TANK] Esteira Esq:{l}% | Esteira Dir:{r}%"
        }

    # GIMBAL
    if cmd == "GIMBAL":
        gx = int(tokens[1]) if len(tokens) > 1 and tokens[1].isdigit() else 90
        gy = int(tokens[2]) if len(tokens) > 2 and tokens[2].isdigit() else 90
        return {
            "protocol": "TEXT_GIMBAL",
            "type": "gimbal",
            "gimbal": {"x": gx, "y": gy},
            "summary": f"[GIMBAL] Pan/X:{gx}° Tilt/Y:{gy}°"
        }

    # SENSOR (dados de aceleração e giroscópio do smartphone)
    if cmd in ("SENSOR", "SENSORS"):
        try:
            pitch = float(tokens[1]) if len(tokens) > 1 else 0.0
            roll = float(tokens[2]) if len(tokens) > 2 else 0.0
            yaw = float(tokens[3]) if len(tokens) > 3 else 0.0
            ax = float(tokens[4]) if len(tokens) > 4 else 0.0
            ay = float(tokens[5]) if len(tokens) > 5 else 0.0
            az = float(tokens[6]) if len(tokens) > 6 else 0.0
            return {
                "protocol": "TEXT_SENSOR",
                "type": "sensor",
                "sensor": {"pitch": pitch, "roll": roll, "yaw": yaw, "ax": ax, "ay": ay, "az": az},
                "summary": f"[SENSOR] Pitch:{pitch:.1f}° Roll:{roll:.1f}° Yaw:{yaw:.1f}°"
            }
        except Exception:
            pass

    # ARM / DISARM
    if cmd in ("ARM", "DISARM"):
        val = (cmd == "ARM") if len(tokens) == 1 else (int(tokens[1]) > 0 if tokens[1].isdigit() else True)
        return {
            "protocol": "TEXT_FLIGHT",
            "type": "flight_status",
            "armed": val,
            "summary": f"[AERO] Motor {'ARMADO ⚠️' if val else 'DESARMADO'}"
        }

    # MODE
    if cmd == "MODE":
        mode_str = tokens[1].upper() if len(tokens) > 1 else "MANUAL"
        return {
            "protocol": "TEXT_FLIGHT",
            "type": "flight_status",
            "mode": mode_str,
            "summary": f"[AERO] Modo de Voo alterado para: {mode_str}"
        }

    # FLAPS
    if cmd == "FLAPS":
        fl = int(tokens[1]) if len(tokens) > 1 and tokens[1].isdigit() else 0
        return {
            "protocol": "TEXT_FLIGHT",
            "type": "flight_control",
            "flaps": fl,
            "summary": f"[AERO] Flaps: {fl}%"
        }

    # GEAR (trem de pouso)
    if cmd == "GEAR":
        g_val = int(tokens[1]) > 0 if len(tokens) > 1 and tokens[1].isdigit() else True
        return {
            "protocol": "TEXT_FLIGHT",
            "type": "flight_control",
            "gear": g_val,
            "summary": f"[AERO] Trem de Pouso: {'RECOLHIDO (UP)' if g_val else 'BAIXADO (DOWN)'}"
        }

    # CH / CANAL DIRETO (CH1..CH16)
    if cmd.startswith("CH") and (len(cmd) > 2 and cmd[2:].isdigit()):
        ch_num = int(cmd[2:])
        val = int(tokens[1]) if len(tokens) > 1 and tokens[1].isdigit() else 1500
        return {
            "protocol": "TEXT_CHANNEL",
            "type": "channel",
            "channel": ch_num,
            "value": val,
            "summary": f"[CANAL] CH{ch_num} -> {val} µs"
        }
    elif cmd == "CH":
        ch_num = int(tokens[1]) if len(tokens) > 1 and tokens[1].isdigit() else 1
        val = int(tokens[2]) if len(tokens) > 2 and tokens[2].isdigit() else 1500
        return {
            "protocol": "TEXT_CHANNEL",
            "type": "channel",
            "channel": ch_num,
            "value": val,
            "summary": f"[CANAL] CH{ch_num} -> {val} µs"
        }

    # CONTROLES PERSONALIZADOS (LAYOUT CUSTOM)
    if cmd in ("SLIDER", "BTN", "TOGGLE", "CUSTOM", "PADD"):
        name = tokens[1] if len(tokens) > 1 else "custom"
        val = tokens[2] if len(tokens) > 2 else "1"
        return {
            "protocol": "CUSTOM_LAYOUT",
            "type": "custom",
            "custom": {"name": name, "value": val, "cmd": cmd},
            "summary": f"[CUSTOM {cmd}] {name} = {val}"
        }

    # PARADA DE EMERGÊNCIA
    if cmd in ("STOP", "S"):
        return {
            "protocol": "TEXT_CMD",
            "type": "stop",
            "summary": "🛑 PARADA DE EMERGÊNCIA ATIVADA!"
        }

    # LUZ / FAROL
    if cmd in ("LIGHT", "FAROL"):
        val = int(tokens[1]) if len(tokens) > 1 and tokens[1].isdigit() else None
        return {
            "protocol": "TEXT_CMD",
            "type": "light",
            "value": val,
            "summary": f"💡 Farol: {'LIGADO' if val != 0 else 'DESLIGADO'}"
        }

    # BUZINA
    if cmd in ("HORN", "BUZINA"):
        val = int(tokens[1]) > 0 if len(tokens) > 1 and tokens[1].isdigit() else True
        return {
            "protocol": "TEXT_CMD",
            "type": "horn",
            "value": val,
            "summary": f"📢 Buzina: {'ACIONADA' if val else 'LIBERADA'}"
        }

    # TURBO
    if cmd == "TURBO":
        val = int(tokens[1]) > 0 if len(tokens) > 1 and tokens[1].isdigit() else True
        return {
            "protocol": "TEXT_CMD",
            "type": "turbo",
            "value": val,
            "summary": f"⚡ Turbo: {'ATIVO' if val else 'DESATIVADO'}"
        }

    # SERVOS / BRAÇO ROBÓTICO
    if cmd.startswith("SRV") or cmd in ("GRIP", "S1", "S2", "S3", "S4"):
        val = int(tokens[1]) if len(tokens) > 1 and tokens[1].isdigit() else 90
        joint = 1
        if "1" in cmd: joint = 1
        elif "2" in cmd: joint = 2
        elif "3" in cmd: joint = 3
        elif "4" in cmd or cmd == "GRIP": joint = 4
        return {
            "protocol": "TEXT_SERVO",
            "type": "servo",
            "joint": joint,
            "value": val,
            "summary": f"🦾 Servo S{joint} -> {val}°"
        }

    # CLÁSSICO 1 LETRA (F, B, L, R, G, I, H, J, S)
    if len(cmd) == 1:
        single_map = {
            "F": (0, 80, "FRENTE"),
            "B": (0, -80, "RÉ"),
            "L": (-80, 0, "ESQUERDA"),
            "R": (80, 0, "DIREITA"),
            "G": (-50, 70, "FRENTE-ESQ"),
            "I": (50, 70, "FRENTE-DIR"),
            "H": (-50, -70, "RÉ-ESQ"),
            "J": (50, -70, "RÉ-DIR"),
            "S": (0, 0, "PARAR")
        }
        if cmd in single_map:
            x, y, desc = single_map[cmd]
            left = max(-100, min(100, y + x))
            right = max(-100, min(100, y - x))
            return {
                "protocol": "TEXT_CLASSIC",
                "type": "drive",
                "drive": {"steering": x, "throttle": y, "left": left, "right": right},
                "summary": f"[RC Clássico] Comando '{cmd}' -> {desc}"
            }

    # GENÉRICO
    return {
        "protocol": "GENERIC",
        "type": "unknown",
        "raw": raw_str,
        "summary": f"Pacote: {raw_str[:60]}"
    }
