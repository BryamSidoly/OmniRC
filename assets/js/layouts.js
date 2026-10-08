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
