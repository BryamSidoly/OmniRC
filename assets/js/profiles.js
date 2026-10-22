/**
 * OmniRC Exportable & Importable Profiles Manager
 * Gerenciador completo de perfis exportáveis e importáveis:
 * Salva e compartilha configurações de veículos, controladores, protocolos e layouts.
 */
const ProfileManager = {
    STORAGE_KEY: 'omnirc_profiles',

    factoryProfiles: [
        {
            id: 'fpv_drone_crsf',
            name: '🚁 FPV Racing Drone 5" (CRSF/ELRS 50Hz)',
            vehicleType: 'drone',
            isFactory: true,
            version: '2.0',
            createdAt: '2026-10-15T12:00:00Z',
            description: 'Multirrotor de corrida/freestyle FPV com alta taxa de atualização. Protocolo binário CRSF a 50Hz (20ms), mapeamento AETR, Modo 2, chave ARM de segurança e telemetria de bateria/link.',
            activeLayoutId: 'drone_quad',
            protocol: {
                format: 'CRSF',
                txRateMs: 20,
                channelMap: 'AETR',
                stickMode: 2,
                deadzone: 3,
                valueRange: 'US',
                telemetry: {
                    decoder: 'CRSF',
                    warnLowBatteryVoltage: 14.4,
                    critLowBatteryVoltage: 14.0,
                    warnBatteryPct: 20,
                    warnLowRssi: -85,
                    warnLowLq: 70,
                    audioAlerts: true
                },
                diagnostics: {
                    enabled: true,
                    showOverlayOnAllModes: true,
                    pingProbe: true,
                    pingIntervalMs: 1000,
                    lossAlertThreshold: 5,
                    latencyAlertThreshold: 100
                }
            },
            controls: {
                speedLimit: 100,
                hapticsEnabled: true,
                deadzone: 3,
                stickMode: 2,
                channelMap: 'AETR',
                trims: { ail: 0, ele: 0, rud: 0, thr: 0 }
            },
            connection: {
                type: 'WIFI_UDP',
                host: '192.168.4.1',
                port: 8888,
                baudRate: 115200
            }
        },
        {
            id: 'rc_crawler_esp32',
            name: '🏎️ RC Rock Crawler 4x4 (ESP32 / Delimited)',
            vehicleType: 'car',
            isFactory: true,
            version: '2.0',
            createdAt: '2026-10-15T12:00:00Z',
            description: 'Carro RC Crawler Off-road 4x4 com acelerador progressivo, comando de faróis, buzina e turbo boost. Envio em texto delimitado por vírgula a 30Hz.',
            activeLayoutId: 'rc_car',
            protocol: {
                format: 'DELIMITED',
                delimiter: ',',
                lineEnding: '\\n',
                template: 'RC:{cmd}:{x}:{y}:{val}\\n',
                valueRange: 'PERCENT',
                txRateMs: 33,
                differentialSteering: false,
                deadzone: 4,
                telemetry: {
                    decoder: 'DELIMITED',
                    warnLowBatteryVoltage: 7.2,
                    critLowBatteryVoltage: 6.8,
                    warnBatteryPct: 15,
                    warnLowRssi: -85,
                    warnLowLq: 70,
                    audioAlerts: true
                },
                diagnostics: {
                    enabled: true,
                    showOverlayOnAllModes: true,
                    pingProbe: true,
                    pingIntervalMs: 1000,
                    lossAlertThreshold: 8,
                    latencyAlertThreshold: 120
                }
            },
            controls: {
                speedLimit: 85,
                hapticsEnabled: true,
                deadzone: 4,
                differentialSteering: false,
                trims: { ail: 0, ele: 0, rud: 0, thr: 0 }
            },
            connection: {
                type: 'WIFI_UDP',
                host: '192.168.4.1',
                port: 8888,
                baudRate: 115200
            }
        },
        {
            id: 'ardupilot_rover_mavlink',
            name: '🛸 ArduPilot / Pixhawk Rover (MAVLink v2)',
            vehicleType: 'car',
            isFactory: true,
            version: '2.0',
            createdAt: '2026-10-15T12:00:00Z',
            description: 'Veículo terrestre autônomo com piloto automático ArduPilot / Pixhawk. Protocolo MAVLink v2 com decodificação de telemetria completa (GPS, bateria, altitude, velocidade e bússola).',
            activeLayoutId: 'rc_car',
            protocol: {
                format: 'MAVLINK',
                txRateMs: 50,
                channelMap: 'AETR',
                stickMode: 2,
                deadzone: 5,
                valueRange: 'US',
                telemetry: {
                    decoder: 'MAVLINK',
                    warnLowBatteryVoltage: 11.1,
                    critLowBatteryVoltage: 10.5,
                    warnBatteryPct: 20,
                    warnLowRssi: -85,
                    warnLowLq: 70,
                    audioAlerts: true
                },
                diagnostics: {
                    enabled: true,
                    showOverlayOnAllModes: true,
                    pingProbe: true,
                    pingIntervalMs: 1000,
                    lossAlertThreshold: 6,
                    latencyAlertThreshold: 150
                }
            },
            controls: {
                speedLimit: 100,
                hapticsEnabled: true,
                deadzone: 5,
                trims: { ail: 0, ele: 0, rud: 0, thr: 0 }
            },
            connection: {
                type: 'WIFI_UDP',
                host: '192.168.4.1',
                port: 8888,
                baudRate: 57600
            }
        },
        {
            id: 'inav_fixed_wing',
            name: '✈️ Aeromodelo Asa Fixa / FPV Wing (iNav MSP)',
            vehicleType: 'plane',
            isFactory: true,
            version: '2.0',
            createdAt: '2026-10-15T12:00:00Z',
            description: 'Aeromodelo asa fixa com comando de ailerons, profundor, motor cut de emergência, controle de flaps em 3 níveis e telemetria de voo MSP.',
            activeLayoutId: 'airplane_wing',
            protocol: {
                format: 'MSP',
                txRateMs: 40,
                channelMap: 'AETR',
                stickMode: 2,
                deadzone: 3,
                valueRange: 'US',
                telemetry: {
                    decoder: 'MSP',
                    warnLowBatteryVoltage: 11.0,
                    critLowBatteryVoltage: 10.4,
                    warnBatteryPct: 20,
                    warnLowRssi: -85,
                    warnLowLq: 70,
                    audioAlerts: true
                },
                diagnostics: {
                    enabled: true,
                    showOverlayOnAllModes: true,
                    pingProbe: true,
                    pingIntervalMs: 1000,
                    lossAlertThreshold: 5,
                    latencyAlertThreshold: 100
                }
            },
            controls: {
                speedLimit: 100,
                hapticsEnabled: true,
                deadzone: 3,
                trims: { ail: 0, ele: 0, rud: 0, thr: 0 }
            },
            connection: {
                type: 'WIFI_UDP',
                host: '192.168.4.1',
                port: 8888,
                baudRate: 115200
            }
        },
        {
            id: 'combat_tank_dualtrack',
            name: '🛡️ Tanque de Combate (Esteiras Diferenciais)',
            vehicleType: 'tank',
            isFactory: true,
            version: '2.0',
            createdAt: '2026-10-15T12:00:00Z',
            description: 'Veículo com tração diferencial independente em duas esteiras. Giro de 360° no próprio eixo, gatilho de disparo de canhão e acionamento de gerador de fumaça.',
            activeLayoutId: 'tank',
            protocol: {
                format: 'DELIMITED',
                delimiter: ',',
                lineEnding: '\\n',
                valueRange: 'PERCENT',
                txRateMs: 50,
                differentialSteering: true,
                deadzone: 5,
                telemetry: {
                    decoder: 'AUTO',
                    warnLowBatteryVoltage: 7.4,
                    critLowBatteryVoltage: 6.8,
                    audioAlerts: true
                },
                diagnostics: {
                    enabled: true,
                    showOverlayOnAllModes: true,
                    pingProbe: true,
                    pingIntervalMs: 1000
                }
            },
            controls: {
                speedLimit: 100,
                hapticsEnabled: true,
                deadzone: 5,
                differentialSteering: true
            },
            connection: {
                type: 'WIFI_UDP',
                host: '192.168.4.1',
                port: 8888,
                baudRate: 115200
            }
        },
        {
            id: 'robot_arm_4dof',
            name: '🦾 Braço Robótico Articulado 4-DOF (Servos)',
            vehicleType: 'robot_arm',
            isFactory: true,
            version: '2.0',
            createdAt: '2026-10-15T12:00:00Z',
            description: 'Braço robótico articulado com 4 servomotores (Base, Ombro, Cotovelo e Garra/Gripper). Sliders de precisão e presets rápidos (Posição Home, Pegar, Soltar).',
            activeLayoutId: 'robot_arm',
            protocol: {
                format: 'DELIMITED',
                delimiter: ',',
                lineEnding: '\\n',
                valueRange: 'BYTE',
                txRateMs: 60,
                telemetry: { decoder: 'AUTO', audioAlerts: false },
                diagnostics: { enabled: true, showOverlayOnAllModes: false, pingProbe: false }
            },
            controls: {
                speedLimit: 100,
                hapticsEnabled: false
            },
            connection: {
                type: 'BT_CLASSIC',
                host: '',
                port: 0,
                baudRate: 9600
            }
        },
        {
            id: 'rc_transmitter_universal',
            name: '📻 Transmissor Universal 16CH (EdgeTX / RadioMaster)',
            vehicleType: 'drone',
            isFactory: true,
            version: '2.0',
            createdAt: '2026-10-15T12:00:00Z',
            description: 'Painel universal de rádio transmissor estilo EdgeTX / OpenTX / RadioMaster TX16S com 16 canais independentes em microsegundos (µs), trims e chaves lógicas.',
            activeLayoutId: 'rc_transmitter',
            protocol: {
                format: 'CRSF',
                txRateMs: 20,
                channelMap: 'AETR',
                stickMode: 2,
                deadzone: 2,
                valueRange: 'US',
                telemetry: {
                    decoder: 'CRSF',
                    warnLowBatteryVoltage: 11.1,
                    critLowBatteryVoltage: 10.2,
                    warnBatteryPct: 20,
                    warnLowRssi: -85,
                    warnLowLq: 70,
                    audioAlerts: true
                },
                diagnostics: {
                    enabled: true,
                    showOverlayOnAllModes: true,
                    pingProbe: true,
                    pingIntervalMs: 1000
                }
            },
            controls: {
                speedLimit: 100,
                hapticsEnabled: true,
                stickMode: 2,
                channelMap: 'AETR',
                trims: { ch1: 0, ch2: 0, ch3: 0, ch4: 0 }
            },
            connection: {
                type: 'WIFI_UDP',
                host: '192.168.4.1',
                port: 8888,
                baudRate: 115200
            }
        }
    ],

    customProfiles: [],

    init() {
        this.loadCustomProfiles();
    },

    loadCustomProfiles() {
        try {
            let saved = null;
            if (window.Android && typeof window.Android.loadConfig === 'function') {
                saved = window.Android.loadConfig('profiles', null);
            } else {
                saved = localStorage.getItem(this.STORAGE_KEY);
            }

            if (saved && saved !== 'null' && saved !== 'undefined') {
                const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
                if (Array.isArray(parsed)) {
                    this.customProfiles = parsed;
                }
            }
        } catch (e) {
            console.warn('[ProfileManager] Erro ao carregar perfis customizados:', e);
            this.customProfiles = [];
        }
    },

    saveCustomProfilesToStorage() {
        try {
            const serialized = JSON.stringify(this.customProfiles);
            if (window.Android && typeof window.Android.saveConfig === 'function') {
                window.Android.saveConfig('profiles', serialized);
            } else {
                localStorage.setItem(this.STORAGE_KEY, serialized);
            }
            return true;
        } catch (e) {
            console.error('[ProfileManager] Erro ao salvar perfis:', e);
            return false;
        }
    },

    getAllProfiles() {
        return [...this.factoryProfiles, ...this.customProfiles];
    },

    getProfileById(id) {
        return this.getAllProfiles().find(p => p.id === id) || null;
    },

    saveCurrentAsProfile(name, vehicleType, description) {
        if (!name || !name.trim()) {
            throw new Error('O nome do perfil é obrigatório.');
        }

        const id = 'prof_user_' + Date.now();
        const activeLayoutId = LayoutManager.currentLayoutId || 'rc_car';
        const currentLayout = LayoutManager.getCurrent();

        // Snapshot completo
        const newProfile = {
            id: id,
            name: name.trim(),
            vehicleType: vehicleType || 'car',
            isFactory: false,
            version: '2.0',
            createdAt: new Date().toISOString(),
            description: (description || '').trim() || `Configuração personalizada salva em ${new Date().toLocaleDateString()}`,
            activeLayoutId: activeLayoutId,
            layout: JSON.parse(JSON.stringify(currentLayout)),
            protocol: JSON.parse(JSON.stringify(ProtocolManager.config || {})),
            controls: {
                speedLimit: window._speedLimit || 100,
                hapticsEnabled: window._hapticsEnabled !== false,
                stickMode: (ProtocolManager.config && ProtocolManager.config.stickMode) || 2,
                channelMap: (ProtocolManager.config && ProtocolManager.config.channelMap) || 'AETR',
                deadzone: (ProtocolManager.config && ProtocolManager.config.deadzone) || 5,
                differentialSteering: !!(ProtocolManager.config && ProtocolManager.config.differentialSteering)
            },
            connection: {
                type: window._currentConnectionType || 'WIFI_UDP',
                host: (document.getElementById('wifi-ip') && document.getElementById('wifi-ip').value) || '192.168.4.1',
                port: parseInt(document.getElementById('wifi-port') && document.getElementById('wifi-port').value) || 8888,
                baudRate: parseInt(document.getElementById('usb-baud') && document.getElementById('usb-baud').value) || 115200
            }
        };

        this.customProfiles.unshift(newProfile);
        this.saveCustomProfilesToStorage();
        return newProfile;
    },

    deleteProfile(id) {
        const idx = this.customProfiles.findIndex(p => p.id === id);
        if (idx !== -1) {
            this.customProfiles.splice(idx, 1);
            this.saveCustomProfilesToStorage();
            return true;
        }
        return false;
    },

    applyProfile(id) {
        const profile = this.getProfileById(id);
        if (!profile) {
            throw new Error(`Perfil '${id}' não encontrado.`);
        }

        // 1. Atualiza e salva o protocolo
        if (profile.protocol) {
            Object.assign(ProtocolManager.config, JSON.parse(JSON.stringify(profile.protocol)));
            const strProto = JSON.stringify(ProtocolManager.config);
            if (window.Android && window.Android.saveConfig) {
                window.Android.saveConfig('protocol', strProto);
            } else {
                localStorage.setItem('omnirc_protocol', strProto);
            }
        }

        // 2. Atualiza controles globais
        if (profile.controls) {
            if (typeof profile.controls.speedLimit === 'number') {
                window._speedLimit = profile.controls.speedLimit;
                const slSlider = document.getElementById('speed-limit');
                const slVal = document.getElementById('val-speed-limit');
                if (slSlider) slSlider.value = profile.controls.speedLimit;
                if (slVal) slVal.innerText = `${profile.controls.speedLimit}%`;
            }
            if (typeof profile.controls.hapticsEnabled === 'boolean') {
                window._hapticsEnabled = profile.controls.hapticsEnabled;
                const hapticCb = document.getElementById('opt-haptics');
                if (hapticCb) hapticCb.checked = profile.controls.hapticsEnabled;
            }
        }

        // 3. Atualiza Layout
        const targetLayoutId = profile.activeLayoutId || 'rc_car';
        if (profile.layout && LayoutManager.layouts) {
            LayoutManager.layouts[targetLayoutId] = JSON.parse(JSON.stringify(profile.layout));
            LayoutManager.saveCurrent(LayoutManager.layouts[targetLayoutId]);
        }
        LayoutManager.setLayout(targetLayoutId);

        // 4. Atualiza dropdown de Layouts na barra superior
        const selLayout = document.getElementById('layout-select');
        if (selLayout) selLayout.value = targetLayoutId;

        // 5. Renderiza a interface do layout
        if (typeof window.renderLayout === 'function') {
            window.renderLayout(targetLayoutId);
        }

        // 6. Atualiza configurações do gerenciador de diagnóstico e telemetria
        if (window.DiagnosticManager && profile.protocol && profile.protocol.diagnostics) {
            window.DiagnosticManager.applyConfig(profile.protocol.diagnostics);
        }

        // 7. Feedback de áudio e háptico
        if (typeof window.playBeep === 'function') window.playBeep(980, 0.08);
        if (typeof window.triggerHaptic === 'function') window.triggerHaptic(40);

        return profile;
    },

    exportProfileJson(id) {
        const profile = this.getProfileById(id);
        if (!profile) throw new Error('Perfil não encontrado para exportação.');
        
        // Cria cópia exportável limpa
        const exportObj = JSON.parse(JSON.stringify(profile));
        exportObj.exportedAt = new Date().toISOString();
        exportObj.exporter = 'OmniRC 2.0';
        return JSON.stringify(exportObj, null, 2);
    },

    downloadProfileFile(id) {
        const profile = this.getProfileById(id);
        if (!profile) return false;

        const jsonStr = this.exportProfileJson(id);
        const safeName = profile.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
        const filename = `omnirc_profile_${safeName}.json`;

        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
    },

    copyProfileToClipboard(id) {
        const jsonStr = this.exportProfileJson(id);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(jsonStr);
        } else {
            // Fallback para textarea invisível
            return new Promise((resolve, reject) => {
                try {
                    const ta = document.createElement('textarea');
                    ta.value = jsonStr;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
        }
    },

    importProfileJson(jsonStr) {
        if (!jsonStr || typeof jsonStr !== 'string') {
            throw new Error('Conteúdo JSON inválido ou vazio.');
        }

        let parsed;
        try {
            parsed = JSON.parse(jsonStr);
        } catch (e) {
            throw new Error('Formato JSON inválido: verifique se o arquivo está corrompido.');
        }

        if (!parsed.name || typeof parsed.name !== 'string') {
            throw new Error('JSON não é um perfil OmniRC válido (campo "name" ausente).');
        }

        // Gera novo ID único para não conflitar com perfis existentes ou presets de fábrica
        const importedId = 'prof_import_' + Date.now();
        const importedProfile = {
            id: importedId,
            name: `${parsed.name.replace(/\(Importado\)/g, '').trim()} (Importado)`,
            vehicleType: parsed.vehicleType || 'custom',
            isFactory: false,
            version: parsed.version || '2.0',
            createdAt: parsed.createdAt || new Date().toISOString(),
            description: parsed.description || 'Perfil importado com sucesso.',
            activeLayoutId: parsed.activeLayoutId || 'rc_car',
            layout: parsed.layout || null,
            protocol: parsed.protocol || {},
            controls: parsed.controls || {},
            connection: parsed.connection || {}
        };

        this.customProfiles.unshift(importedProfile);
        this.saveCustomProfilesToStorage();
        return importedProfile;
    },

    importProfileFromFile(file, onSuccess, onError) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = this.importProfileJson(e.target.result);
                if (typeof onSuccess === 'function') onSuccess(imported);
            } catch (err) {
                if (typeof onError === 'function') onError(err);
            }
        };
        reader.onerror = () => {
            if (typeof onError === 'function') onError(new Error('Erro ao ler arquivo do dispositivo.'));
        };
        reader.readAsText(file);
    }
};

// Auto-inicializa o ProfileManager
ProfileManager.init();
