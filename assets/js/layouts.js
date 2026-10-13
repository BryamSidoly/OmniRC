/**
 * OmniRC Layouts & Preset Templates
 */
const LayoutManager = {
    currentLayoutId: 'rc_car',

    defaultLayouts: {
        rc_car: {
            id: 'rc_car',
            name: '🏎️ Carro RC / Rover',
            type: 'rc_car',
            description: 'Controle clássico: Aceleração na esquerda e Direção na direita com botões rápidos.',
            buttons: [
                { id: 'btn_light', label: '💡 Farol', cmd: 'LIGHT', type: 'toggle', active: false, color: '#FFD700' },
                { id: 'btn_horn', label: '📢 Buzina', cmd: 'HORN', type: 'momentary', color: '#00E5FF' },
                { id: 'btn_turbo', label: '⚡ Turbo', cmd: 'TURBO', type: 'momentary', color: '#FF0055' },
                { id: 'btn_gear', label: '⚙️ Marcha', cmd: 'GEAR', type: 'toggle', active: false, color: '#00FF88' }
            ],
            speedLimit: 100
        },
        tank: {
            id: 'tank',
            name: '🛡️ Tanque / Esteiras',
            type: 'tank',
            description: 'Tração diferencial: Controle independente da esteira esquerda e direita.',
            buttons: [
                { id: 'btn_spin_l', label: '🔄 Giro Esq.', cmd: 'SPIN_L', type: 'momentary', color: '#00E5FF' },
                { id: 'btn_spin_r', label: '🔄 Giro Dir.', cmd: 'SPIN_R', type: 'momentary', color: '#00E5FF' },
                { id: 'btn_smoke', label: '💨 Fumaça', cmd: 'SMOKE', type: 'toggle', active: false, color: '#888888' },
                { id: 'btn_fire', label: '💥 Disparo', cmd: 'FIRE', type: 'momentary', color: '#FF3300' }
            ]
        },
        gamepad: {
            id: 'gamepad',
            name: '🎮 Gamepad Completo',
            type: 'gamepad',
            description: 'Gamepad estilo controle de console com D-Pad, dois analógicos e botões ABXY.',
            buttons: [
                { id: 'btn_a', label: 'A', cmd: 'BTN_A', type: 'momentary', color: '#00FF88' },
                { id: 'btn_b', label: 'B', cmd: 'BTN_B', type: 'momentary', color: '#FF3366' },
                { id: 'btn_x', label: 'X', cmd: 'BTN_X', type: 'momentary', color: '#00E5FF' },
                { id: 'btn_y', label: 'Y', cmd: 'BTN_Y', type: 'momentary', color: '#FFCC00' },
                { id: 'btn_l1', label: 'L1', cmd: 'BTN_L1', type: 'momentary', color: '#888888' },
                { id: 'btn_r1', label: 'R1', cmd: 'BTN_R1', type: 'momentary', color: '#888888' }
            ]
        },
        robot_arm: {
            id: 'robot_arm',
            name: '🦾 Braço Robótico / Servos',
            type: 'robot_arm',
            description: 'Controle de juntas articuladas e servos com sliders precisos.',
            servos: [
                { id: 's1', label: 'Base Giratória (S1)', cmd: 'SRV1', min: 0, max: 180, value: 90 },
                { id: 's2', label: 'Ombro (S2)', cmd: 'SRV2', min: 0, max: 180, value: 90 },
                { id: 's3', label: 'Cotovelo (S3)', cmd: 'SRV3', min: 0, max: 180, value: 90 },
                { id: 's4', label: 'Garra / Gripper (S4)', cmd: 'GRIP', min: 0, max: 180, value: 30 }
            ],
            buttons: [
                { id: 'btn_home', label: '🏠 Posição Inicial', cmd: 'POS_HOME', type: 'momentary', color: '#00E5FF' },
                { id: 'btn_pick', label: '📦 Pegar Objeto', cmd: 'POS_PICK', type: 'momentary', color: '#00FF88' },
                { id: 'btn_drop', label: '📤 Soltar Objeto', cmd: 'POS_DROP', type: 'momentary', color: '#FF9900' }
            ]
        },
        custom_matrix: {
            id: 'custom_matrix',
            name: '🎨 Layout Personalizado',
            type: 'custom_matrix',
            description: 'Painel 100% customizável: adicione e configure analógicos, sliders, botões e espaçadores.',
            items: [
                { id: 'c_joy1', type: 'joystick', label: 'Analógico 1', cmd: 'JOY1', axis: 'BOTH', autoReturn: true, width: '50%' },
                { id: 'c_sl1', type: 'slider', label: 'Acelerador / PWM', cmd: 'SPEED', min: 0, max: 255, value: 128, width: '50%' },
                { id: 'c_sp1', type: 'spacer', label: 'Comandos & Funções', height: 16, width: '100%' },
                { id: 'c_btn1', type: 'button', label: '💡 Farol', cmd: 'LIGHT', releaseCmd: '', btnType: 'toggle', active: false, color: '#FFD700', width: '50%' },
                { id: 'c_btn2', type: 'button', label: '📢 Buzina', cmd: 'HORN', releaseCmd: '', btnType: 'momentary', color: '#00E5FF', width: '50%' },
                { id: 'c_btn3', type: 'button', label: '⚡ Turbo', cmd: 'TURBO', releaseCmd: 'TURBO_OFF', btnType: 'momentary', color: '#FF0055', width: '50%' },
                { id: 'c_btn4', type: 'button', label: '🛑 Parar', cmd: 'STOP', releaseCmd: '', btnType: 'momentary', color: '#FF3366', width: '50%' }
            ]
        },
        terminal: {
            id: 'terminal',
            name: '📟 Monitor & Terminal Serial',
            type: 'terminal',
            description: 'Envio manual de comandos de texto / hexadecimal e monitor em tempo real.',
            quickCommands: ['PING', 'STATUS', 'STOP', 'VERSION', 'RESET', 'HELP']
        },
        drone_quad: {
            id: 'drone_quad',
            name: '🚁 Drone / Multirrotor (FPV / INAV / Betaflight)',
            type: 'drone_quad',
            description: 'Controle clássico de 4 eixos (Roll, Pitch, Yaw, Throttle), chave ARM de segurança, Modos de Voo (Acro, Angle, RTH), Beeper e Turtle flip.',
            armState: false,
            flightMode: 'ANGLE',
            beeper: false,
            turtle: false,
            buttons: [
                { id: 'btn_drone_arm', label: '🔒 DISARMED', cmd: 'ARM', type: 'arm_toggle', active: false, color: '#00FF88' },
                { id: 'btn_drone_mode', label: '🛡️ Modo: ANGLE', cmd: 'FLIGHT_MODE', type: 'mode_cycle', color: '#00E5FF' },
                { id: 'btn_drone_beep', label: '🔊 Beeper', cmd: 'BEEPER', type: 'momentary', color: '#FFD700' },
                { id: 'btn_drone_turtle', label: '🐢 Turtle Flip', cmd: 'TURTLE', type: 'toggle', active: false, color: '#FF0055' }
            ]
        },
        airplane_wing: {
            id: 'airplane_wing',
            name: '✈️ Avião / Asa Fixa (Fixed Wing / ArduPlane)',
            type: 'airplane_wing',
            description: 'Superfícies de controle Aileron, Profundor, Leme, Acelerador, Flaps em 3 estágios, Trem de Pouso retrátil, Motor Cut e Trims digitais.',
            motorCut: true,
            flightMode: 'MANUAL',
            flaps: 0,
            gearDown: true,
            buttons: [
                { id: 'btn_plane_cut', label: '🛑 MOTOR CUT: ATIVO', cmd: 'MOTOR_CUT', type: 'cut_toggle', active: true, color: '#FF3366' },
                { id: 'btn_plane_mode', label: '✈️ Modo: MANUAL', cmd: 'PLANE_MODE', type: 'mode_cycle', color: '#00E5FF' },
                { id: 'btn_plane_flaps', label: '🪶 Flaps: 0%', cmd: 'FLAPS', type: 'flap_cycle', color: '#00FF88' },
                { id: 'btn_plane_gear', label: '🛞 Trem: BAIXADO', cmd: 'GEAR', type: 'gear_toggle', active: true, color: '#FFD700' }
            ],
            trims: { ail: 0, ele: 0, rud: 0, thr: 0 }
        },
        heli_cp: {
            id: 'heli_cp',
            name: '🚁 Helicóptero RC (Collective Pitch 3D / Scale)',
            type: 'heli_cp',
            description: 'Passo Coletivo e Cíclico, Throttle Hold (Auto-rotação), Chave Idle-Up 3D, Ganho de Giroscópio Trava-Cauda (AVCS) e Chave Dual Rate.',
            throttleHold: true,
            idleUpMode: 'NORMAL',
            gyroGain: 70,
            dualRate: 100,
            buttons: [
                { id: 'btn_heli_hold', label: '🛑 THROTTLE HOLD: ON', cmd: 'THROTTLE_HOLD', type: 'hold_toggle', active: true, color: '#FF3366' },
                { id: 'btn_heli_idle', label: '⚡ Idle-Up: NORMAL', cmd: 'IDLE_UP', type: 'idle_cycle', color: '#00E5FF' },
                { id: 'btn_heli_dr', label: '🎯 D/R: 100% Sport', cmd: 'DUAL_RATE', type: 'dr_toggle', color: '#00FF88' },
                { id: 'btn_heli_gyro', label: '🧭 Gyro: AVCS 70%', cmd: 'GYRO_MODE', type: 'gyro_cycle', color: '#FFD700' }
            ]
        },
        rc_transmitter: {
            id: 'rc_transmitter',
            name: '📻 Rádio Transmissor Geral (Universal 16CH)',
            type: 'rc_transmitter',
            description: 'Emulador profissional de rádio transmissor 16 canais (estilo RadioMaster TX16S/Boxer/Taranis) com alternância Modo 1/Modo 2, ordem de canais AETR/TAER, 4 Trims e 6 Chaves.',
            stickMode: 2,
            channelMap: 'AETR',
            switches: { SA: 0, SB: 0, SC: 0, SD: 0 },
            pots: { S1: 50, S2: 50 },
            trims: { ch1: 0, ch2: 0, ch3: 0, ch4: 0 }
        }
    },

    layouts: null,

    init(savedLayouts) {
        // Deep copy defaults
        this.layouts = JSON.parse(JSON.stringify(this.defaultLayouts));
        if (savedLayouts && savedLayouts !== 'null' && savedLayouts !== 'undefined') {
            try {
                const parsed = typeof savedLayouts === 'string' ? JSON.parse(savedLayouts) : savedLayouts;
                if (parsed && typeof parsed === 'object') {
                    Object.assign(this.layouts, parsed);
                }
            } catch (e) {
                console.error("Error loading saved layouts", e);
            }
        }

        // Auto-migrate legacy custom_matrix with buttons/sliders to items array if needed
        const cm = this.layouts.custom_matrix;
        if (cm && !cm.items) {
            cm.items = [];
            if (cm.buttons && Array.isArray(cm.buttons)) {
                cm.buttons.forEach(b => {
                    cm.items.push({
                        id: b.id,
                        type: 'button',
                        label: b.label,
                        cmd: b.cmd,
                        releaseCmd: b.releaseCmd || '',
                        btnType: b.type || 'momentary',
                        active: !!b.active,
                        color: b.color || '#00E5FF',
                        width: '50%'
                    });
                });
            }
            if (cm.sliders && Array.isArray(cm.sliders)) {
                cm.sliders.forEach(s => {
                    cm.items.push({
                        id: s.id,
                        type: 'slider',
                        label: s.label,
                        cmd: s.cmd,
                        min: s.min || 0,
                        max: s.max || 255,
                        value: s.value || 128,
                        width: '100%'
                    });
                });
            }
        }
    },

    getCurrent() {
        if (!this.layouts || Object.keys(this.layouts).length === 0) {
            this.init();
        }
        return this.layouts[this.currentLayoutId] || 
               this.layouts.rc_car || 
               this.defaultLayouts[this.currentLayoutId] || 
               this.defaultLayouts.rc_car;
    },

    setLayout(id) {
        if (!this.layouts) this.init();
        if (this.layouts[id] || this.defaultLayouts[id]) {
            this.currentLayoutId = id;
            return true;
        }
        return false;
    },

    saveCurrent(updatedLayout) {
        this.layouts[this.currentLayoutId] = updatedLayout;
        const serialized = JSON.stringify(this.layouts);
        if (window.Android && window.Android.saveConfig) {
            window.Android.saveConfig('layouts', serialized);
        } else {
            try {
                localStorage.setItem('omnirc_layouts', serialized);
            } catch (e) {}
        }
    },

    resetToDefault(id) {
        if (this.defaultLayouts[id]) {
            this.layouts[id] = JSON.parse(JSON.stringify(this.defaultLayouts[id]));
            this.saveCurrent(this.layouts[id]);
        }
    }
};
