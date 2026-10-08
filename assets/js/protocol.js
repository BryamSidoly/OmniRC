/**
 * OmniRC Protocol Manager
 * Handles message formatting, template substitutions, number mapping and transmission
 */
const ProtocolManager = {
    config: {
        format: 'DELIMITED', // 'RAW', 'DELIMITED', 'JSON', 'HEX', 'TEMPLATE'
        template: 'RC:{cmd}:{x}:{y}:{val}\\n',
        delimiter: ',',
        lineEnding: '\\n', // '\\n', '\\r\\n', 'none'
        valueRange: 'PERCENT', // 'PERCENT' (-100..100), 'BYTE' (0..255, 128 center), 'PWM' (-255..255)
        differentialSteering: false, // calculates Left and Right track values
        invertX: false,
        invertY: false,
        deadzone: 5, // percent
        txRateMs: 50 // 20Hz transmission
    },

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
        }
        return Math.round(val);
    },

    computeDifferential(x, y) {
        // x = steer (-100..100), y = throttle (-100..100)
        let left = y + x;
        let right = y - x;
        left = Math.max(-100, Math.min(100, left));
        right = Math.max(-100, Math.min(100, right));
        return {
            left: this.mapAxis(left),
            right: this.mapAxis(right)
        };
    },

    formatCommand(cmd, params = {}) {
        let x = params.x !== undefined ? (this.config.invertX ? -params.x : params.x) : 0;
        let y = params.y !== undefined ? (this.config.invertY ? -params.y : params.y) : 0;
        let val = params.val !== undefined ? params.val : 0;

        let mappedX = this.mapAxis(x);
        let mappedY = this.mapAxis(y);
        let mappedVal = this.mapAxis(val);

        let diff = this.computeDifferential(x, y);

        let ending = this.config.lineEnding === '\\n' ? '\n' : 
                     this.config.lineEnding === '\\r\\n' ? '\r\n' : '';

        if (this.config.format === 'RAW') {
            return cmd + ending;
        } else if (this.config.format === 'DELIMITED') {
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
        } else if (this.config.format === 'JSON') {
            let obj = { cmd };
            if (params.x !== undefined) obj.x = mappedX;
            if (params.y !== undefined) obj.y = mappedY;
            if (params.val !== undefined) obj.val = mappedVal;
            if (this.config.differentialSteering) {
                obj.left = diff.left;
                obj.right = diff.right;
            }
            return JSON.stringify(obj) + ending;
        } else if (this.config.format === 'HEX') {
            // Hex packet: 0xAA [CMD_HASH] [X_BYTE] [Y_BYTE] [VAL_BYTE] 0x55
            let xb = (mappedX + 256) & 0xFF;
            let yb = (mappedY + 256) & 0xFF;
            let vb = (mappedVal + 256) & 0xFF;
            let cmdByte = (cmd.charCodeAt(0) || 0) & 0xFF;
            return `AA ${cmdByte.toString(16).padStart(2, '0')} ${xb.toString(16).padStart(2, '0')} ${yb.toString(16).padStart(2, '0')} ${vb.toString(16).padStart(2, '0')} 55`;
        } else if (this.config.format === 'TEMPLATE') {
            let tpl = this.config.template;
            tpl = tpl.replace('{cmd}', cmd)
                     .replace('{x}', mappedX)
                     .replace('{y}', mappedY)
                     .replace('{val}', mappedVal)
                     .replace('{left}', diff.left)
                     .replace('{right}', diff.right)
                     .replace('\\n', '\n')
                     .replace('\\r', '\r');
            return tpl;
        }
        return cmd + ending;
    }
};
