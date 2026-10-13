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
        stickMode: 2 // 2 (Left Throttle/Yaw, Right Pitch/Roll) or 1 (Right Throttle/Roll)
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
    }
};
