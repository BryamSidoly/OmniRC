/**
 * OmniRC Protocol Manager
 * Handles message formatting, template substitutions, number mapping,
 * and high-performance aeromodelling binary protocols (CRSF, SBUS, IBUS, MAVLink, MSP).
 */
const ProtocolManager = {
    config: {
        format: 'DELIMITED', // 'RAW', 'DELIMITED', 'JSON', 'HEX', 'TEMPLATE', 'CRSF', 'SBUS', 'IBUS', 'MAVLINK', 'MSP'
        template: 'RC:{cmd}:{x}:{y}:{val}\\n',
        delimiter: ',',
        lineEnding: '\\n', // '\\n', '\\r\\n', 'none'
        valueRange: 'PERCENT', // 'PERCENT' (-100..100), 'BYTE' (0..255, 128 center), 'PWM' (-255..255), 'US' (1000..2000)
        differentialSteering: false, // calculates Left and Right track values
        invertX: false,
        invertY: false,
        deadzone: 5, // percent
        txRateMs: 50, // 20Hz default, 20ms for 50Hz, 10ms for 100Hz
        channelMap: 'AETR', // 'AETR', 'TAER', 'RETA'
        stickMode: 2, // 2 (Left Throttle/Yaw, Right Pitch/Roll) or 1 (Right Throttle/Roll)
        // Telemetry Decoder Configuration
        telemetry: {
            decoder: 'AUTO', // 'AUTO', 'JSON', 'DELIMITED', 'CRSF', 'MAVLINK', 'MSP', 'KEYVALUE'
            warnLowBatteryVoltage: 10.8,
            critLowBatteryVoltage: 10.2,
            warnBatteryPct: 20,
            warnLowRssi: -85,
            warnLowLq: 70,
            audioAlerts: true
        },
        // Connection Diagnostics Configuration
        diagnostics: {
            enabled: true,
            showOverlayOnAllModes: true,
            pingProbe: true,
            pingIntervalMs: 1000,
            lossAlertThreshold: 5,
            latencyAlertThreshold: 120
        }
    },

    // 16 channels in microseconds (1000..2000 us, center 1500 us, throttle idle 1000 us)
    channels: [
        1500, // Aileron / Roll
        1500, // Elevator / Pitch
        1000, // Throttle (Default idle)
        1500, // Rudder / Yaw
        1000, // CH5 (AUX1 / ARM: 1000 = Disarmed, 2000 = Armed)
        1000, // CH6 (AUX2 / Flight Mode: 1000 = Manual/Acro, 1500 = Angle/FBWA, 2000 = RTH)
        1000, // CH7 (AUX3 / Flaps or Beeper: 1000 = Off, 1500 = Half, 2000 = Full)
        1000, // CH8 (AUX4 / Gear or Turtle: 1000 = Down, 2000 = Up)
        1500, // CH9 (AUX5 / Gyro Gain or S1)
        1500, // CH10 (AUX6 / S2)
        1500, // CH11
        1500, // CH12
        1500, // CH13
        1500, // CH14
        1500, // CH15
        1500  // CH16
    ],

    mavlinkSeq: 0,

    init(savedConfig) {
        if (savedConfig) {
            Object.assign(this.config, savedConfig);
        }
    },

    mapAxis(val) {
        // val is -100 .. 100
        if (Math.abs(val) < this.config.deadzone) val = 0;
        if (this.config.valueRange === 'PERCENT') {
            return Math.round(val);
        } else if (this.config.valueRange === 'BYTE') {
            // Map -100..100 to 0..255 (center 128)
            return Math.round(((val + 100) / 200) * 255);
        } else if (this.config.valueRange === 'PWM') {
            // Map -100..100 to -255..255
            return Math.round((val / 100) * 255);
        } else if (this.config.valueRange === 'US') {
            // Map -100..100 to 1000..2000
            return Math.round(1500 + (val * 5));
        }
        return Math.round(val);
    },

    computeDifferential(x, y) {
        let left = y + x;
        let right = y - x;
        left = Math.max(-100, Math.min(100, left));
        right = Math.max(-100, Math.min(100, right));
        return {
            left: this.mapAxis(left),
            right: this.mapAxis(right)
        };
    },

    // Set a raw channel value in microseconds (1000 to 2000 us)
    setChannel(chIndex, us) {
        if (chIndex >= 0 && chIndex < 16) {
            this.channels[chIndex] = Math.max(988, Math.min(2012, Math.round(us)));
        }
    },

    // Update primary sticks: roll, pitch, throttle, yaw (-100..100, throttle 0..100 or -100..100)
    updateAeroSticks(roll, pitch, throttle, yaw, isThrottleBipolar = false) {
        // Map -100..100 to 1000..2000 us (center 1500 us)
        const rollUs = Math.round(1500 + (roll * 5));
        const pitchUs = Math.round(1500 + (pitch * 5));
        const yawUs = Math.round(1500 + (yaw * 5));

        // Throttle: if 0..100%, map to 1000..2000 us; if -100..100%, map to 1000..2000 us
        let thrUs;
        if (isThrottleBipolar) {
            thrUs = Math.round(1500 + (throttle * 5));
        } else {
            const clampedThr = Math.max(0, Math.min(100, throttle));
            thrUs = Math.round(1000 + (clampedThr * 10));
        }

        // Apply Channel Map (AETR, TAER, RETA)
        const map = this.config.channelMap || 'AETR';
        if (map === 'AETR') {
            this.channels[0] = rollUs;   // A
            this.channels[1] = pitchUs;  // E
            this.channels[2] = thrUs;    // T
            this.channels[3] = yawUs;    // R
        } else if (map === 'TAER') {
            this.channels[0] = thrUs;    // T
            this.channels[1] = rollUs;   // A
            this.channels[2] = pitchUs;  // E
            this.channels[3] = yawUs;    // R
        } else if (map === 'RETA') {
            this.channels[0] = yawUs;    // R
            this.channels[1] = pitchUs;  // E
            this.channels[2] = thrUs;    // T
            this.channels[3] = rollUs;   // A
        }
    },

    // Get current 16 channels in microsecond format
    getChannels() {
        return [...this.channels];
    },

    // ==========================================
    // CRSF (ExpressLRS / TBS Crossfire) ENCODER
    // ==========================================
    encodeCrsf() {
        // CRSF frame: [Sync 0xC8] [Len 24] [Type 0x16] [Payload 22 bytes] [CRC8]
        const sync = 0xC8; // Flight controller target
        const len = 24;    // Type (1) + Payload (22) + CRC (1)
        const type = 0x16; // CRSF_FRAMETYPE_RC_CHANNELS_PACKED

        // Convert 1000..2000 us to CRSF 11-bit scale (988us -> 172, 1500us -> 992, 2012us -> 1811)
        const crsfChannels = new Uint16Array(16);
        for (let i = 0; i < 16; i++) {
            const us = this.channels[i];
            const crsfVal = Math.round(((us - 988) * (1811 - 172) / (2012 - 988)) + 172);
            crsfChannels[i] = Math.max(0, Math.min(2047, crsfVal));
        }

        // Pack 16 channels (11 bits each) into 22 bytes
        const payload = new Uint8Array(22);
        let bitPos = 0;
        for (let ch = 0; ch < 16; ch++) {
            const val = crsfChannels[ch];
            for (let b = 0; b < 11; b++) {
                if ((val >> b) & 1) {
                    const byteIdx = Math.floor(bitPos / 8);
                    const bitIdx = bitPos % 8;
                    payload[byteIdx] |= (1 << bitIdx);
                }
                bitPos++;
            }
        }

        // CRC8 DVB-S2 (poly 0xD5) over Type + Payload (23 bytes)
        let crc = 0;
        const crcData = [type, ...payload];
        for (let i = 0; i < crcData.length; i++) {
            crc ^= crcData[i];
            for (let j = 0; j < 8; j++) {
                if (crc & 0x80) {
                    crc = ((crc << 1) ^ 0xD5) & 0xFF;
                } else {
                    crc = (crc << 1) & 0xFF;
                }
            }
        }

        // Assemble 26-byte buffer
        const frame = [sync, len, type, ...payload, crc];
        return frame.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    },

    // ==========================================
    // SBUS (Futaba / FrSky / RadioMaster) ENCODER
    // ==========================================
    encodeSbus() {
        // SBUS frame: 25 bytes: [0x0F] [22 bytes packed 16x11bit] [Flags] [0x00]
        const sbusChannels = new Uint16Array(16);
        for (let i = 0; i < 16; i++) {
            const us = this.channels[i];
            // 1000us -> 172, 2000us -> 1811
            const sbusVal = Math.round(((us - 1000) * (1811 - 172) / 1000) + 172);
            sbusChannels[i] = Math.max(0, Math.min(2047, sbusVal));
        }

        const payload = new Uint8Array(22);
        let bitPos = 0;
        for (let ch = 0; ch < 16; ch++) {
            const val = sbusChannels[ch];
            for (let b = 0; b < 11; b++) {
                if ((val >> b) & 1) {
                    const byteIdx = Math.floor(bitPos / 8);
                    const bitIdx = bitPos % 8;
                    payload[byteIdx] |= (1 << bitIdx);
                }
                bitPos++;
            }
        }

        const frame = [0x0F, ...payload, 0x00, 0x00];
        return frame.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    },

    // ==========================================
    // IBUS (FlySky) ENCODER
    // ==========================================
    encodeIbus() {
        // IBUS frame: 32 bytes: [0x20 0x40] [14 x uint16 LE] [Checksum uint16 LE]
        const frame = new Uint8Array(32);
        frame[0] = 0x20;
        frame[1] = 0x40;

        for (let i = 0; i < 14; i++) {
            const us = this.channels[i];
            frame[2 + i * 2] = us & 0xFF;
            frame[3 + i * 2] = (us >> 8) & 0xFF;
        }

        let sum = 0;
        for (let i = 0; i < 30; i++) {
            sum += frame[i];
        }
        const checksum = (0xFFFF - sum) & 0xFFFF;
        frame[30] = checksum & 0xFF;
        frame[31] = (checksum >> 8) & 0xFF;

        const hexArr = [];
        for (let i = 0; i < 32; i++) hexArr.push(frame[i].toString(16).padStart(2, '0').toUpperCase());
        return hexArr.join(' ');
    },

    // ==========================================
    // MAVLINK v1 ENCODER (ArduPilot / Pixhawk)
    // ==========================================
    encodeMavlink() {
        // Message #70: RC_CHANNELS_OVERRIDE (Payload 18 bytes)
        // chan1_raw..chan8_raw (uint16 LE), target_system (uint8), target_component (uint8)
        const payloadLen = 18;
        const msgId = 70;
        const seq = (this.mavlinkSeq++) & 0xFF;
        const sysId = 255; // GCS
        const compId = 190; // Mission planner / control

        const payload = new Uint8Array(payloadLen);
        for (let i = 0; i < 8; i++) {
            const us = this.channels[i];
            payload[i * 2] = us & 0xFF;
            payload[i * 2 + 1] = (us >> 8) & 0xFF;
        }
        payload[16] = 1; // target_system (Vehicle 1)
        payload[17] = 1; // target_component (Autopilot)

        const headerAndPayload = [0xFE, payloadLen, seq, sysId, compId, msgId, ...payload];

        // MAVLink CRC-16 X.25 (seed CRC_EXTRA = 124 for msg 70)
        let crc = 0xFFFF;
        for (let i = 1; i < headerAndPayload.length; i++) {
            let tmp = headerAndPayload[i] ^ (crc & 0xFF);
            tmp ^= (tmp << 4) & 0xFF;
            crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xFFFF;
        }
        // CRC EXTRA
        let tmp = 124 ^ (crc & 0xFF);
        tmp ^= (tmp << 4) & 0xFF;
        crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xFFFF;

        const frame = [...headerAndPayload, crc & 0xFF, (crc >> 8) & 0xFF];
        return frame.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    },

    // ==========================================
    // MSP (MultiWii Serial Protocol v1 / INAV / Betaflight)
    // ==========================================
    encodeMsp() {
        // Header: $M< [size 16] [cmd 200] [ch0..ch7 uint16 LE] [crc]
        const size = 16; // 8 channels x 2 bytes
        const cmd = 200; // MSP_SET_RAW_RC
        const payload = [];

        for (let i = 0; i < 8; i++) {
            const us = this.channels[i];
            payload.push(us & 0xFF);
            payload.push((us >> 8) & 0xFF);
        }

        let crc = size ^ cmd;
        for (let i = 0; i < payload.length; i++) {
            crc ^= payload[i];
        }

        // '$', 'M', '<' = 0x24, 0x4D, 0x3C
        const frame = [0x24, 0x4D, 0x3C, size, cmd, ...payload, crc];
        return frame.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    },

    // ==========================================
    // GENERAL COMMAND FORMATTER
    // ==========================================
    formatCommand(cmd, params = {}) {
        const fmt = this.config.format;

        // If aeromodelling binary protocol is selected:
        if (fmt === 'CRSF') return this.encodeCrsf();
        if (fmt === 'SBUS') return this.encodeSbus();
        if (fmt === 'IBUS') return this.encodeIbus();
        if (fmt === 'MAVLINK') return this.encodeMavlink();
        if (fmt === 'MSP') return this.encodeMsp();

        let x = params.x !== undefined ? (this.config.invertX ? -params.x : params.x) : 0;
        let y = params.y !== undefined ? (this.config.invertY ? -params.y : params.y) : 0;
        let val = params.val !== undefined ? params.val : 0;

        let mappedX = this.mapAxis(x);
        let mappedY = this.mapAxis(y);
        let mappedVal = this.mapAxis(val);

        let diff = this.computeDifferential(x, y);

        let ending = this.config.lineEnding === '\\n' ? '\n' : 
                     this.config.lineEnding === '\\r\\n' ? '\r\n' : '';

        if (fmt === 'RAW') {
            return cmd + ending;
        } else if (fmt === 'DELIMITED') {
            let parts = [cmd];
            if (params.x !== undefined || params.y !== undefined) {
                if (this.config.differentialSteering) {
                    parts.push(diff.left, diff.right);
                } else {
                    parts.push(mappedX, mappedY);
                }
            }
            if (params.val !== undefined) parts.push(mappedVal);
            return parts.join(this.config.delimiter) + ending;
        } else if (fmt === 'JSON') {
            let obj = { cmd };
            if (params.x !== undefined) obj.x = mappedX;
            if (params.y !== undefined) obj.y = mappedY;
            if (params.val !== undefined) obj.val = mappedVal;
            if (this.config.differentialSteering) {
                obj.left = diff.left;
                obj.right = diff.right;
            }
            // Include aeromodel channels if available
            if (params.isAero) {
                obj.channels = this.channels.slice(0, 8);
            }
            return JSON.stringify(obj) + ending;
        } else if (fmt === 'HEX') {
            let xb = (mappedX + 256) & 0xFF;
            let yb = (mappedY + 256) & 0xFF;
            let vb = (mappedVal + 256) & 0xFF;
            let cmdByte = (cmd.charCodeAt(0) || 0) & 0xFF;
            return `AA ${cmdByte.toString(16).padStart(2, '0')} ${xb.toString(16).padStart(2, '0')} ${yb.toString(16).padStart(2, '0')} ${vb.toString(16).padStart(2, '0')} 55`;
        } else if (fmt === 'TEMPLATE') {
            let tpl = this.config.template;
            tpl = tpl.replace('{cmd}', cmd)
                     .replace('{x}', mappedX)
                     .replace('{y}', mappedY)
                     .replace('{val}', mappedVal)
                     .replace('{left}', diff.left)
                     .replace('{right}', diff.right)
                     .replace('{ch1}', this.channels[0])
                     .replace('{ch2}', this.channels[1])
                     .replace('{ch3}', this.channels[2])
                     .replace('{ch4}', this.channels[3])
                     .replace('{ch5}', this.channels[4])
                     .replace('{ch6}', this.channels[5])
                     .replace('\\n', '\n')
                     .replace('\\r', '\r');
            return tpl;
        }
        return cmd + ending;
    },

    // ==========================================
    // INCOMING TELEMETRY PARSER ENGINE
    // ==========================================
    parseHexBytes(input) {
        if (!input || typeof input !== 'string') return null;
        const clean = input.trim().replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
        if (clean.length < 4 || clean.length % 2 !== 0) return null;
        const bytes = new Uint8Array(clean.length / 2);
        for (let i = 0; i < clean.length; i += 2) {
            bytes[i / 2] = parseInt(clean.substr(i, 2), 16);
        }
        return bytes;
    },

    parseTelemetry(raw) {
        if (!raw) return null;
        const mode = (this.config.telemetry && this.config.telemetry.decoder) ? this.config.telemetry.decoder : 'AUTO';

        let bytes = null;
        if (raw instanceof Uint8Array) {
            bytes = raw;
        } else if (typeof raw === 'string') {
            const trimmed = raw.trim();
            // Check if string is raw JSON first
            if ((mode === 'AUTO' || mode === 'JSON') && (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
                const res = this.parseJsonTelemetry(trimmed);
                if (res) return res;
            }

            // Check if text is Delimited / Key-Value
            if (mode === 'AUTO' || mode === 'DELIMITED' || mode === 'KEYVALUE') {
                const res = this.parseKeyValueOrCsv(trimmed);
                if (res) return res;
            }

            // Try parsing as Hex string for binary protocols
            bytes = this.parseHexBytes(trimmed);
        }

        if (bytes && bytes.length >= 4) {
            // CRSF Detection (Sync 0xC8, 0xEE, 0xEA)
            if ((mode === 'AUTO' || mode === 'CRSF') && (bytes[0] === 0xC8 || bytes[0] === 0xEE || bytes[0] === 0xEA)) {
                const crsf = this.parseCrsfTelemetry(bytes);
                if (crsf) return crsf;
            }

            // MAVLink Detection (Sync 0xFE for v1 or 0xFD for v2)
            if ((mode === 'AUTO' || mode === 'MAVLINK') && (bytes[0] === 0xFE || bytes[0] === 0xFD)) {
                const mav = this.parseMavlinkTelemetry(bytes);
                if (mav) return mav;
            }

            // MSP Detection (Sync '$', 'M', '>')
            if ((mode === 'AUTO' || mode === 'MSP') && bytes[0] === 0x24 && bytes[1] === 0x4D && bytes[2] === 0x3E) {
                const msp = this.parseMspTelemetry(bytes);
                if (msp) return msp;
            }
        }

        return null;
    },

    parseJsonTelemetry(str) {
        try {
            const data = JSON.parse(str);
            if (typeof data !== 'object' || data === null) return null;

            const res = { hasData: true, protocol: 'JSON' };
            if (data.voltage !== undefined) res.voltage = parseFloat(data.voltage);
            else if (data.bat !== undefined) res.voltage = parseFloat(data.bat);
            else if (data.batt !== undefined) res.voltage = parseFloat(data.batt);
            else if (data.vbat !== undefined) res.voltage = parseFloat(data.vbat);
            else if (data.v !== undefined) res.voltage = parseFloat(data.v);

            if (data.percent !== undefined) res.percent = Math.round(data.percent);
            else if (data.pct !== undefined) res.percent = Math.round(data.pct);
            else if (data.soc !== undefined) res.percent = Math.round(data.soc);

            if (data.current !== undefined) res.current = parseFloat(data.current);
            else if (data.cur !== undefined) res.current = parseFloat(data.cur);
            else if (data.amp !== undefined) res.current = parseFloat(data.amp);

            if (data.capacity !== undefined) res.capacity = parseFloat(data.capacity);
            else if (data.mah !== undefined) res.capacity = parseFloat(data.mah);

            if (data.altitude !== undefined) res.altitude = parseFloat(data.altitude);
            else if (data.alt !== undefined) res.altitude = parseFloat(data.alt);

            if (data.climb !== undefined) res.climbRate = parseFloat(data.climb);
            else if (data.vario !== undefined) res.climbRate = parseFloat(data.vario);

            if (data.speed !== undefined) res.speed = parseFloat(data.speed);
            else if (data.spd !== undefined) res.speed = parseFloat(data.spd);
            else if (data.vel !== undefined) res.speed = parseFloat(data.vel);

            if (data.satellites !== undefined) res.satellites = parseInt(data.satellites);
            else if (data.sats !== undefined) res.satellites = parseInt(data.sats);

            if (data.fix !== undefined) res.fix = data.fix;
            if (data.lat !== undefined) res.lat = parseFloat(data.lat);
            if (data.lon !== undefined) res.lon = parseFloat(data.lon);
            else if (data.lng !== undefined) res.lon = parseFloat(data.lng);

            if (data.rssi !== undefined) res.rssi = parseFloat(data.rssi);
            if (data.lq !== undefined) res.lq = Math.round(data.lq);
            if (data.snr !== undefined) res.snr = parseFloat(data.snr);
            if (data.heading !== undefined) res.heading = parseFloat(data.heading);
            else if (data.hdg !== undefined) res.heading = parseFloat(data.hdg);

            if (data.mode !== undefined) res.flightMode = data.mode;
            if (data.armed !== undefined) res.armed = !!data.armed;
            if (data.temp !== undefined) res.temp = parseFloat(data.temp);
            if (data.alert !== undefined) res.rawAlert = data.alert;

            // Only return if it actually looks like telemetry
            if (res.voltage !== undefined || res.altitude !== undefined || res.speed !== undefined || res.satellites !== undefined || res.rssi !== undefined) {
                return res;
            }
        } catch (e) {}
        return null;
    },

    parseKeyValueOrCsv(str) {
        if (!str || str.length < 3) return null;
        const clean = str.replace(/[\r\n]/g, '').trim();

        // 1. Delimited CSV: TELEM,12.4,85,45.2,32.1,14,-68,100
        if (clean.toUpperCase().startsWith('TELEM,') || clean.toUpperCase().startsWith('TLM,')) {
            const parts = clean.split(',');
            if (parts.length >= 3) {
                const res = { hasData: true, protocol: 'CSV' };
                if (parts[1] && !isNaN(parts[1])) res.voltage = parseFloat(parts[1]);
                if (parts[2] && !isNaN(parts[2])) res.percent = Math.round(parts[2]);
                if (parts[3] && !isNaN(parts[3])) res.altitude = parseFloat(parts[3]);
                if (parts[4] && !isNaN(parts[4])) res.speed = parseFloat(parts[4]);
                if (parts[5] && !isNaN(parts[5])) res.satellites = parseInt(parts[5]);
                if (parts[6] && !isNaN(parts[6])) res.rssi = parseFloat(parts[6]);
                if (parts[7] && !isNaN(parts[7])) res.lq = Math.round(parts[7]);
                return res;
            }
        }

        // 2. Key-Value pairs: BAT:12.4,ALT:45.2,SPD:32,SATS:14,RSSI:-68,LQ:99
        if (clean.includes(':') || clean.includes('=')) {
            const tokens = clean.split(/[,;\s]+/);
            const res = { hasData: true, protocol: 'KEY-VALUE' };
            let matchedKeys = 0;

            tokens.forEach(tok => {
                const sep = tok.includes(':') ? ':' : '=';
                const [k, v] = tok.split(sep);
                if (!k || v === undefined) return;
                const key = k.trim().toUpperCase();
                const val = v.trim();
                const num = parseFloat(val);

                if (['BAT', 'BATT', 'VOLT', 'VBAT', 'V'].includes(key) && !isNaN(num)) {
                    res.voltage = num; matchedKeys++;
                } else if (['PCT', 'SOC', 'PERC'].includes(key) && !isNaN(num)) {
                    res.percent = Math.round(num); matchedKeys++;
                } else if (['CUR', 'AMP', 'CURRENT', 'A'].includes(key) && !isNaN(num)) {
                    res.current = num; matchedKeys++;
                } else if (['MAH', 'CAP'].includes(key) && !isNaN(num)) {
                    res.capacity = num; matchedKeys++;
                } else if (['ALT', 'ALTITUDE', 'H'].includes(key) && !isNaN(num)) {
                    res.altitude = num; matchedKeys++;
                } else if (['SPD', 'SPEED', 'VEL', 'S'].includes(key) && !isNaN(num)) {
                    res.speed = num; matchedKeys++;
                } else if (['SATS', 'SAT', 'GPS'].includes(key) && !isNaN(num)) {
                    res.satellites = Math.round(num); matchedKeys++;
                } else if (['RSSI', 'SIG'].includes(key) && !isNaN(num)) {
                    res.rssi = num; matchedKeys++;
                } else if (['LQ'].includes(key) && !isNaN(num)) {
                    res.lq = Math.round(num); matchedKeys++;
                } else if (['HDG', 'HEAD'].includes(key) && !isNaN(num)) {
                    res.heading = num; matchedKeys++;
                } else if (['LAT'].includes(key) && !isNaN(num)) {
                    res.lat = num; matchedKeys++;
                } else if (['LON', 'LNG'].includes(key) && !isNaN(num)) {
                    res.lon = num; matchedKeys++;
                } else if (['MODE'].includes(key)) {
                    res.flightMode = val; matchedKeys++;
                } else if (['ARM', 'ARMED'].includes(key)) {
                    res.armed = (val === '1' || val.toUpperCase() === 'TRUE'); matchedKeys++;
                } else if (['ALERT', 'WARN'].includes(key)) {
                    res.rawAlert = val; matchedKeys++;
                }
            });

            if (matchedKeys >= 1 && (res.voltage !== undefined || res.altitude !== undefined || res.speed !== undefined || res.satellites !== undefined || res.rssi !== undefined)) {
                return res;
            }
        }

        return null;
    },

    parseCrsfTelemetry(bytes) {
        if (!bytes || bytes.length < 4) return null;
        const len = bytes[1];
        const type = bytes[2];
        const payload = bytes.slice(3, 3 + len - 2);
        const res = { hasData: true, protocol: 'CRSF' };

        // 0x08: CRSF_FRAMETYPE_BATTERY_SENSOR
        if (type === 0x08 && payload.length >= 8) {
            const vRaw = (payload[0] << 8) | payload[1];
            const cRaw = (payload[2] << 8) | payload[3];
            const capRaw = (payload[4] << 16) | (payload[5] << 8) | payload[6];
            const remPct = payload[7];

            res.voltage = vRaw / 10.0;
            res.current = cRaw / 10.0;
            res.capacity = capRaw;
            res.percent = remPct;
            return res;
        }

        // 0x14: CRSF_FRAMETYPE_LINK_STATISTICS
        if (type === 0x14 && payload.length >= 7) {
            res.rssi = -payload[0]; // Uplink RSSI 1 (dBm)
            res.rssi2 = -payload[1];
            res.lq = payload[2]; // Uplink LQ %
            res.snr = (payload[3] << 24) >> 24; // Signed int8 SNR
            return res;
        }

        // 0x02: CRSF_FRAMETYPE_GPS
        if (type === 0x02 && payload.length >= 15) {
            const rawLat = (payload[0] << 24) | (payload[1] << 16) | (payload[2] << 8) | payload[3];
            const rawLon = (payload[4] << 24) | (payload[5] << 16) | (payload[6] << 8) | payload[7];
            const rawSpd = (payload[8] << 8) | payload[9];
            const rawHdg = (payload[10] << 8) | payload[11];
            const rawAlt = (payload[12] << 8) | payload[13];
            const sats = payload[14];

            res.lat = rawLat / 1e7;
            res.lon = rawLon / 1e7;
            res.speed = rawSpd / 10.0; // km/h
            res.heading = rawHdg / 100.0; // deg
            res.altitude = rawAlt - 1000.0; // m
            res.satellites = sats;
            res.fix = sats >= 4 ? '3D Fix' : (sats > 0 ? '2D Fix' : 'No Fix');
            return res;
        }

        // 0x07: CRSF_FRAMETYPE_VARIO
        if (type === 0x07 && payload.length >= 2) {
            const vspd = ((payload[0] << 8) | payload[1]) << 16 >> 16;
            res.climbRate = vspd / 100.0; // cm/s -> m/s
            return res;
        }

        // 0x21: CRSF_FRAMETYPE_FLIGHT_MODE
        if (type === 0x21 && payload.length >= 1) {
            let modeStr = '';
            for (let i = 0; i < payload.length; i++) {
                if (payload[i] === 0) break;
                modeStr += String.fromCharCode(payload[i]);
            }
            res.flightMode = modeStr.trim();
            return res;
        }

        return null;
    },

    parseMavlinkTelemetry(bytes) {
        if (!bytes || bytes.length < 6) return null;
        const isV1 = bytes[0] === 0xFE;
        const isV2 = bytes[0] === 0xFD;
        if (!isV1 && !isV2) return null;

        const payloadLen = bytes[1];
        let msgId = 0;
        let payloadStart = 6;

        if (isV1) {
            msgId = bytes[5];
            payloadStart = 6;
        } else {
            msgId = bytes[7] | (bytes[8] << 8) | (bytes[9] << 16);
            payloadStart = 10;
        }

        if (bytes.length <= payloadStart) return null;
        const p = bytes.slice(payloadStart, payloadStart + payloadLen);
        const res = { hasData: true, protocol: isV1 ? 'MAVLink v1' : 'MAVLink v2' };

        // Msg #0: HEARTBEAT
        if (msgId === 0 && p.length >= 6) {
            const baseMode = p[5];
            res.armed = (baseMode & 128) !== 0;
            return res;
        }

        // Msg #1: SYS_STATUS
        if (msgId === 1 && p.length >= 19) {
            const vMv = (p[14]) | (p[15] << 8);
            const cCa = (p[16]) | (p[17] << 8);
            const remPct = (p[18] << 24) >> 24; // signed char
            res.voltage = vMv / 1000.0;
            if (cCa > 0) res.current = cCa / 100.0;
            if (remPct >= 0) res.percent = remPct;
            return res;
        }

        // Msg #24: GPS_RAW_INT
        if (msgId === 24 && p.length >= 30) {
            const fixType = p[8];
            const latRaw = (p[9] | (p[10] << 8) | (p[11] << 16) | (p[12] << 24)) << 0;
            const lonRaw = (p[13] | (p[14] << 8) | (p[15] << 16) | (p[16] << 24)) << 0;
            const altRaw = (p[17] | (p[18] << 8) | (p[19] << 16) | (p[20] << 24)) << 0;
            const sats = p[29];

            res.lat = latRaw / 1e7;
            res.lon = lonRaw / 1e7;
            res.altitude = altRaw / 1000.0;
            res.satellites = sats;
            res.fix = fixType >= 3 ? '3D Fix' : (fixType === 2 ? '2D Fix' : 'No Fix');
            return res;
        }

        // Msg #74: VFR_HUD
        if (msgId === 74 && p.length >= 20) {
            // Airspeed, Groundspeed, Heading, Throttle, Alt, Climb
            const view = new DataView(p.buffer, p.byteOffset, p.byteLength);
            const groundspeed = view.getFloat32(4, true);
            const heading = view.getInt16(8, true);
            const alt = view.getFloat32(12, true);
            const climb = view.getFloat32(16, true);

            res.speed = groundspeed * 3.6; // m/s to km/h
            res.heading = heading;
            res.altitude = alt;
            res.climbRate = climb;
            return res;
        }

        return null;
    },

    parseMspTelemetry(bytes) {
        if (!bytes || bytes.length < 6) return null;
        if (bytes[0] !== 0x24 || bytes[1] !== 0x4D || bytes[2] !== 0x3E) return null;
        const size = bytes[3];
        const cmd = bytes[4];
        const p = bytes.slice(5, 5 + size);
        const res = { hasData: true, protocol: 'MSP' };

        // Cmd 110: MSP_ANALOG
        if (cmd === 110 && p.length >= 7) {
            res.voltage = p[0] / 10.0;
            res.capacity = p[1] | (p[2] << 8);
            const rawRssi = p[3] | (p[4] << 8);
            res.rssi = Math.round(((rawRssi / 1023) * 100) - 100); // approx dBm
            res.lq = Math.round(Math.min(100, (rawRssi / 1023) * 100));
            res.current = (p[5] | (p[6] << 8)) / 100.0;
            return res;
        }

        // Cmd 106: MSP_RAW_GPS
        if (cmd === 106 && p.length >= 16) {
            res.fix = p[0] > 0 ? '3D Fix' : 'No Fix';
            res.satellites = p[1];
            const lat = (p[2] | (p[3] << 8) | (p[4] << 16) | (p[5] << 24)) << 0;
            const lon = (p[6] | (p[7] << 8) | (p[8] << 16) | (p[9] << 24)) << 0;
            res.lat = lat / 1e7;
            res.lon = lon / 1e7;
            res.altitude = (p[10] | (p[11] << 8));
            res.speed = ((p[12] | (p[13] << 8)) / 100.0) * 3.6; // cm/s to km/h
            res.heading = (p[14] | (p[15] << 8)) / 10.0;
            return res;
        }

        // Cmd 109: MSP_ALTITUDE
        if (cmd === 109 && p.length >= 6) {
            const alt = (p[0] | (p[1] << 8) | (p[2] << 16) | (p[3] << 24)) << 0;
            const vario = ((p[4] | (p[5] << 8)) << 16) >> 16;
            res.altitude = alt / 100.0;
            res.climbRate = vario / 100.0;
            return res;
        }

        return null;
    }
};
