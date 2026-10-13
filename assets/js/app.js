/**
 * OmniRC Master Application Controller
 */
document.addEventListener('DOMContentLoaded', () => {
    // State variables
    let currentConnection = {
        type: 'NONE', // 'WIFI_UDP', 'WIFI_TCP', 'BT_CLASSIC', 'BT_BLE'
        status: 'DISCONNECTED',
        details: ''
    };

    let txIntervalId = null;
    let joystickState = {
        throttle: 0, // Y (-100 to 100)
        steering: 0, // X (-100 to 100)
        leftTrack: 0,
        rightTrack: 0,
        gamepadLeftX: 0,
        gamepadLeftY: 0,
        gamepadRightX: 0,
        gamepadRightY: 0
    };

    let speedLimit = 100;
    let hapticsEnabled = true;
    let customJoystickInstances = {};
    let customJoystickValues = {};

    // ==========================================
    // INITIALIZE CONFIGS & MANAGERS SAFELY
    // ==========================================
    try {
        let savedLayouts = null;
        let savedProto = null;

        if (window.Android && typeof window.Android.loadConfig === 'function') {
            savedLayouts = window.Android.loadConfig('layouts', null);
            savedProto = window.Android.loadConfig('protocol', null);
        } else {
            savedLayouts = localStorage.getItem('omnirc_layouts');
            savedProto = localStorage.getItem('omnirc_protocol');
        }

        LayoutManager.init(savedLayouts);

        if (savedProto && savedProto !== 'null' && savedProto !== 'undefined') {
            try {
                const protoObj = typeof savedProto === 'string' ? JSON.parse(savedProto) : savedProto;
                ProtocolManager.init(protoObj);
            } catch (e) {
                ProtocolManager.init();
            }
        } else {
            ProtocolManager.init();
        }
    } catch (e) {
        console.error("Initialization error, falling back to defaults:", e);
        LayoutManager.init();
        ProtocolManager.init();
    }

    // ==========================================
    // AUDIO FEEDBACK (Synthesizer via Web Audio)
    // ==========================================
    let audioCtx = null;
    function playBeep(freq = 880, duration = 0.05, type = 'sine') {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (e) {}
    }

    function triggerHaptic(duration = 25) {
        if (!hapticsEnabled) return;
        if (window.Android && window.Android.vibrate) {
            window.Android.vibrate(duration);
        } else if (navigator.vibrate) {
            navigator.vibrate(duration);
        }
    }

    // ==========================================
    // TRANSMISSION LOOP
    // ==========================================
    function sendPacket(rawString, isHex = false) {
        if (window.Android && window.Android.sendPacket) {
            window.Android.sendPacket(rawString, isHex);
        }
        logTerminal(rawString, 'tx');
    }

    function startTxLoop() {
        if (txIntervalId) clearInterval(txIntervalId);
        const rate = (ProtocolManager.config && ProtocolManager.config.txRateMs) ? ProtocolManager.config.txRateMs : 50;

        txIntervalId = setInterval(() => {
            const currentLayout = LayoutManager.currentLayoutId || 'rc_car';

            if (currentLayout === 'rc_car') {
                const limitedThrottle = (joystickState.throttle * speedLimit) / 100;
                const cmd = ProtocolManager.formatCommand('DRIVE', {
                    x: joystickState.steering,
                    y: limitedThrottle
                });
                sendPacket(cmd);
            } else if (currentLayout === 'tank') {
                const cmd = ProtocolManager.formatCommand('TANK', {
                    x: joystickState.rightTrack,
                    y: joystickState.leftTrack
                });
                sendPacket(cmd);
            } else if (currentLayout === 'gamepad') {
                const cmd = ProtocolManager.formatCommand('GP', {
                    x: joystickState.gamepadLeftX,
                    y: joystickState.gamepadLeftY,
                    val: joystickState.gamepadRightY
                });
                sendPacket(cmd);
            } else if (currentLayout === 'custom_matrix') {
                const layout = LayoutManager.getCurrent();
                if (layout && Array.isArray(layout.items)) {
                    layout.items.forEach(item => {
                        if (item.type === 'joystick') {
                            const vals = customJoystickValues[item.id] || { x: 0, y: 0 };
                            const cmd = ProtocolManager.formatCommand(item.cmd || 'JOY', {
                                x: vals.x,
                                y: vals.y
                            });
                            sendPacket(cmd);
                        }
                    });
                }
            } else if (['drone_quad', 'airplane_wing', 'heli_cp', 'rc_transmitter'].includes(currentLayout)) {
                updateAeromodelChannels();
                const isBinary = ['CRSF', 'SBUS', 'IBUS', 'MAVLINK', 'MSP', 'HEX'].includes(ProtocolManager.config.format);
                const cmd = ProtocolManager.formatCommand('AERO', { isAero: true });
                sendPacket(cmd, isBinary);
                updateLiveAeroVisualizers();
            }
        }, rate);
    }

    startTxLoop();

    // ==========================================
    // INITIALIZE JOYSTICKS
    // ==========================================
    // RC Car Joysticks
    const joyThrottle = new VirtualJoystick('joy-throttle', {
        axis: 'Y_ONLY',
        color: '#FFB800',
        onChange: (x, y) => {
            joystickState.throttle = y;
            const el = document.getElementById('telemetry-throttle');
            if (el) el.innerText = `Y: ${y}%`;
        },
        onRelease: () => {
            joystickState.throttle = 0;
            const el = document.getElementById('telemetry-throttle');
            if (el) el.innerText = 'Y: 0%';
            triggerHaptic(15);
        }
    });

    const joySteering = new VirtualJoystick('joy-steering', {
        axis: 'X_ONLY',
        color: '#00E5FF',
        onChange: (x, y) => {
            joystickState.steering = x;
            const el = document.getElementById('telemetry-steering');
            if (el) el.innerText = `X: ${x}%`;
        },
        onRelease: () => {
            joystickState.steering = 0;
            const el = document.getElementById('telemetry-steering');
            if (el) el.innerText = 'X: 0%';
            triggerHaptic(15);
        }
    });

    // Tank Joysticks
    const joyTankLeft = new VirtualJoystick('joy-tank-left', {
        axis: 'Y_ONLY',
        color: '#00E5FF',
        onChange: (x, y) => {
            joystickState.leftTrack = y;
            const el = document.getElementById('telemetry-tank-left');
            if (el) el.innerText = `L: ${y}%`;
        },
        onRelease: () => {
            joystickState.leftTrack = 0;
            const el = document.getElementById('telemetry-tank-left');
            if (el) el.innerText = 'L: 0%';
            triggerHaptic(15);
        }
    });

    const joyTankRight = new VirtualJoystick('joy-tank-right', {
        axis: 'Y_ONLY',
        color: '#00FF88',
        onChange: (x, y) => {
            joystickState.rightTrack = y;
            const el = document.getElementById('telemetry-tank-right');
            if (el) el.innerText = `R: ${y}%`;
        },
        onRelease: () => {
            joystickState.rightTrack = 0;
            const el = document.getElementById('telemetry-tank-right');
            if (el) el.innerText = 'R: 0%';
            triggerHaptic(15);
        }
    });

    // Gamepad Joysticks
    const joyGpLeft = new VirtualJoystick('joy-gamepad-left', {
        axis: 'BOTH',
        color: '#00E5FF',
        onChange: (x, y) => {
            joystickState.gamepadLeftX = x;
            joystickState.gamepadLeftY = y;
            const el = document.getElementById('telemetry-gamepad-left');
            if (el) el.innerText = `X:${x} Y:${y}`;
        },
        onRelease: () => {
            joystickState.gamepadLeftX = 0;
            joystickState.gamepadLeftY = 0;
            const el = document.getElementById('telemetry-gamepad-left');
            if (el) el.innerText = 'X:0 Y:0';
        }
    });

    const joyGpRight = new VirtualJoystick('joy-gamepad-right', {
        axis: 'BOTH',
        color: '#FF3366',
        onChange: (x, y) => {
            joystickState.gamepadRightX = x;
            joystickState.gamepadRightY = y;
            const el = document.getElementById('telemetry-gamepad-right');
            if (el) el.innerText = `X:${x} Y:${y}`;
        },
        onRelease: () => {
            joystickState.gamepadRightX = 0;
            joystickState.gamepadRightY = 0;
            const el = document.getElementById('telemetry-gamepad-right');
            if (el) el.innerText = 'X:0 Y:0';
        }
    });

    // Speed limiter slider
    const sliderSpeedLimit = document.getElementById('slider-speed-limit');
    if (sliderSpeedLimit) {
        sliderSpeedLimit.addEventListener('input', (e) => {
            speedLimit = parseInt(e.target.value);
            const valEl = document.getElementById('val-speed-limit');
            if (valEl) valEl.innerText = `${speedLimit}%`;
        });
    }

    // ==========================================
    // AEROMODELLING STATE & CONTROLS (Drones, Aviões, Helicópteros, Transmissor)
    // ==========================================
    const aeroState = {
        roll: 0,
        pitch: 0,
        throttle: 0,
        yaw: 0,
        trims: { ail: 0, ele: 0, rud: 0, thr: 0 },
        droneArmed: false,
        droneFlightMode: 'ANGLE',
        droneBeeper: false,
        droneTurtle: false,
        planeMotorCut: true,
        planeFlightMode: 'MANUAL',
        planeFlaps: 0,
        planeGearDown: true,
        heliThrottleHold: true,
        heliIdleUp: 'NORMAL',
        heliGyroGain: 70,
        heliDualRate: 100,
        stickMode: 2,
        channelMap: 'AETR',
        switches: { SA: 'UP', SB: 'UP', SC: 'UP', SD: 'UP' },
        pots: { S1: 1500, S2: 1500 }
    };

    // 1. Drone Joysticks
    const joyDroneLeft = new VirtualJoystick('joy-drone-left', {
        axis: 'BOTH',
        color: '#00FF88',
        autoReturn: false,
        onChange: (x, y) => {
            aeroState.yaw = x;
            aeroState.throttle = Math.max(0, Math.min(100, (y + 100) / 2));
            const elThr = document.getElementById('telemetry-drone-thr');
            const elYaw = document.getElementById('telemetry-drone-yaw');
            const usVal = Math.round(1000 + (aeroState.throttle * 10));
            if (elThr) elThr.innerText = `THR: ${Math.round(aeroState.throttle)}% (${usVal}µs)`;
            if (elYaw) elYaw.innerText = `YAW: ${Math.round(x)}%`;
        },
        onRelease: () => {
            aeroState.yaw = 0;
            const elYaw = document.getElementById('telemetry-drone-yaw');
            if (elYaw) elYaw.innerText = 'YAW: 0%';
        }
    });

    const joyDroneRight = new VirtualJoystick('joy-drone-right', {
        axis: 'BOTH',
        color: '#00E5FF',
        autoReturn: true,
        onChange: (x, y) => {
            aeroState.roll = x;
            aeroState.pitch = y;
            const elPit = document.getElementById('telemetry-drone-pitch');
            const elRol = document.getElementById('telemetry-drone-roll');
            if (elPit) elPit.innerText = `PITCH: ${Math.round(y)}%`;
            if (elRol) elRol.innerText = `ROLL: ${Math.round(x)}%`;
        },
        onRelease: () => {
            aeroState.roll = 0;
            aeroState.pitch = 0;
            const elPit = document.getElementById('telemetry-drone-pitch');
            const elRol = document.getElementById('telemetry-drone-roll');
            if (elPit) elPit.innerText = 'PITCH: 0%';
            if (elRol) elRol.innerText = 'ROLL: 0%';
        }
    });

    // 2. Airplane Joysticks
    const joyPlaneLeft = new VirtualJoystick('joy-plane-left', {
        axis: 'BOTH',
        color: '#FFB800',
        autoReturn: false,
        onChange: (x, y) => {
            aeroState.yaw = x;
            aeroState.throttle = Math.max(0, Math.min(100, (y + 100) / 2));
            const elThr = document.getElementById('telemetry-plane-thr');
            const elRud = document.getElementById('telemetry-plane-rud');
            if (elThr) elThr.innerText = `THR: ${Math.round(aeroState.throttle)}%`;
            if (elRud) elRud.innerText = `RUD: ${Math.round(x)}%`;
        },
        onRelease: () => {
            aeroState.yaw = 0;
            const elRud = document.getElementById('telemetry-plane-rud');
            if (elRud) elRud.innerText = 'RUD: 0%';
        }
    });

    const joyPlaneRight = new VirtualJoystick('joy-plane-right', {
        axis: 'BOTH',
        color: '#00E5FF',
        autoReturn: true,
        onChange: (x, y) => {
            aeroState.roll = x;
            aeroState.pitch = y;
            const elEle = document.getElementById('telemetry-plane-ele');
            const elAil = document.getElementById('telemetry-plane-ail');
            if (elEle) elEle.innerText = `ELE: ${Math.round(y)}%`;
            if (elAil) elAil.innerText = `AIL: ${Math.round(x)}%`;
        },
        onRelease: () => {
            aeroState.roll = 0;
            aeroState.pitch = 0;
            const elEle = document.getElementById('telemetry-plane-ele');
            const elAil = document.getElementById('telemetry-plane-ail');
            if (elEle) elEle.innerText = 'ELE: 0%';
            if (elAil) elAil.innerText = 'AIL: 0%';
        }
    });

    // 3. Helicopter Joysticks
    const joyHeliLeft = new VirtualJoystick('joy-heli-left', {
        axis: 'BOTH',
        color: '#FF0055',
        autoReturn: false,
        onChange: (x, y) => {
            aeroState.yaw = x;
            aeroState.throttle = Math.max(0, Math.min(100, (y + 100) / 2));
            const elCol = document.getElementById('telemetry-heli-col');
            const elRud = document.getElementById('telemetry-heli-rud');
            if (elCol) elCol.innerText = `COL: ${Math.round(aeroState.throttle)}%`;
            if (elRud) elRud.innerText = `RUD: ${Math.round(x)}%`;
        },
        onRelease: () => {
            aeroState.yaw = 0;
            const elRud = document.getElementById('telemetry-heli-rud');
            if (elRud) elRud.innerText = 'RUD: 0%';
        }
    });

    const joyHeliRight = new VirtualJoystick('joy-heli-right', {
        axis: 'BOTH',
        color: '#00E5FF',
        autoReturn: true,
        onChange: (x, y) => {
            aeroState.roll = x;
            aeroState.pitch = y;
            const elEle = document.getElementById('telemetry-heli-ele');
            const elAil = document.getElementById('telemetry-heli-ail');
            if (elEle) elEle.innerText = `ELE: ${Math.round(y)}%`;
            if (elAil) elAil.innerText = `AIL: ${Math.round(x)}%`;
        },
        onRelease: () => {
            aeroState.roll = 0;
            aeroState.pitch = 0;
            const elEle = document.getElementById('telemetry-heli-ele');
            const elAil = document.getElementById('telemetry-heli-ail');
            if (elEle) elEle.innerText = 'ELE: 0%';
            if (elAil) elAil.innerText = 'AIL: 0%';
        }
    });

    // 4. Universal RC Transmitter Joysticks
    const joyTxLeft = new VirtualJoystick('joy-tx-left', {
        axis: 'BOTH',
        color: '#00E5FF',
        autoReturn: false,
        onChange: (x, y) => {
            if (aeroState.stickMode === 2) {
                aeroState.yaw = x;
                aeroState.throttle = Math.max(0, Math.min(100, (y + 100) / 2));
            } else {
                aeroState.yaw = x;
                aeroState.pitch = y;
            }
            const elY = document.getElementById('telemetry-tx-left-y');
            const elX = document.getElementById('telemetry-tx-left-x');
            if (elY) elY.innerText = `Y: ${Math.round(y)}%`;
            if (elX) elX.innerText = `X: ${Math.round(x)}%`;
        },
        onRelease: () => {
            if (aeroState.stickMode === 2) {
                aeroState.yaw = 0;
            } else {
                aeroState.yaw = 0;
                aeroState.pitch = 0;
            }
        }
    });

    const joyTxRight = new VirtualJoystick('joy-tx-right', {
        axis: 'BOTH',
        color: '#FFB800',
        autoReturn: true,
        onChange: (x, y) => {
            if (aeroState.stickMode === 2) {
                aeroState.roll = x;
                aeroState.pitch = y;
            } else {
                aeroState.roll = x;
                aeroState.throttle = Math.max(0, Math.min(100, (y + 100) / 2));
            }
            const elY = document.getElementById('telemetry-tx-right-y');
            const elX = document.getElementById('telemetry-tx-right-x');
            if (elY) elY.innerText = `Y: ${Math.round(y)}%`;
            if (elX) elX.innerText = `X: ${Math.round(x)}%`;
        },
        onRelease: () => {
            if (aeroState.stickMode === 2) {
                aeroState.roll = 0;
                aeroState.pitch = 0;
            } else {
                aeroState.roll = 0;
            }
        }
    });

    function updateAeromodelChannels() {
        const layoutId = LayoutManager.currentLayoutId || 'drone_quad';

        let roll = aeroState.roll + (aeroState.trims.ail * 2.5);
        let pitch = aeroState.pitch + (aeroState.trims.ele * 2.5);
        let throttle = aeroState.throttle + (aeroState.trims.thr * 2.5);
        let yaw = aeroState.yaw + (aeroState.trims.rud * 2.5);

        roll = Math.max(-100, Math.min(100, roll));
        pitch = Math.max(-100, Math.min(100, pitch));
        yaw = Math.max(-100, Math.min(100, yaw));

        if (layoutId === 'drone_quad') {
            if (!aeroState.droneArmed) throttle = 0;
            throttle = Math.max(0, Math.min(100, throttle));

            ProtocolManager.setChannel(4, aeroState.droneArmed ? 2000 : 1000);
            const mVal = aeroState.droneFlightMode === 'ACRO' ? 1000 : (aeroState.droneFlightMode === 'ANGLE' ? 1500 : 2000);
            ProtocolManager.setChannel(5, mVal);
            ProtocolManager.setChannel(6, aeroState.droneBeeper ? 2000 : 1000);
            ProtocolManager.setChannel(7, aeroState.droneTurtle ? 2000 : 1000);
            ProtocolManager.updateAeroSticks(roll, pitch, throttle, yaw, false);

        } else if (layoutId === 'airplane_wing') {
            if (aeroState.planeMotorCut) throttle = 0;
            throttle = Math.max(0, Math.min(100, throttle));

            ProtocolManager.setChannel(4, aeroState.planeMotorCut ? 1000 : 2000);
            let pMode = 1000;
            if (aeroState.planeFlightMode === 'FBWA') pMode = 1333;
            else if (aeroState.planeFlightMode === 'CRUISE') pMode = 1666;
            else if (aeroState.planeFlightMode === 'RTH') pMode = 2000;
            ProtocolManager.setChannel(5, pMode);

            const flapVal = aeroState.planeFlaps === 0 ? 1000 : (aeroState.planeFlaps === 50 ? 1500 : 2000);
            ProtocolManager.setChannel(6, flapVal);
            ProtocolManager.setChannel(7, aeroState.planeGearDown ? 1000 : 2000);
            ProtocolManager.updateAeroSticks(roll, pitch, throttle, yaw, false);

        } else if (layoutId === 'heli_cp') {
            let headSpeed = 1000;
            let collective = throttle;

            if (aeroState.heliThrottleHold) {
                headSpeed = 1000;
            } else if (aeroState.heliIdleUp === 'NORMAL') {
                headSpeed = Math.round(1000 + (collective * 9));
            } else if (aeroState.heliIdleUp === 'IDLE1') {
                headSpeed = 1800;
            } else if (aeroState.heliIdleUp === 'IDLE2') {
                headSpeed = 2000;
            }

            ProtocolManager.setChannel(4, aeroState.heliThrottleHold ? 1000 : 2000);
            ProtocolManager.setChannel(5, headSpeed);
            ProtocolManager.setChannel(6, Math.round(1000 + aeroState.heliGyroGain * 10));
            ProtocolManager.setChannel(7, aeroState.heliDualRate === 100 ? 2000 : 1500);
            ProtocolManager.updateAeroSticks(roll, pitch, collective, yaw, false);

        } else if (layoutId === 'rc_transmitter') {
            throttle = Math.max(0, Math.min(100, throttle));

            const saVal = aeroState.switches.SA === 'UP' ? 1000 : (aeroState.switches.SA === 'MID' ? 1500 : 2000);
            const sbVal = aeroState.switches.SB === 'UP' ? 1000 : (aeroState.switches.SB === 'MID' ? 1500 : 2000);
            const scVal = aeroState.switches.SC === 'UP' ? 1000 : (aeroState.switches.SC === 'MID' ? 1500 : 2000);
            const sdVal = aeroState.switches.SD === 'UP' ? 1000 : 2000;

            ProtocolManager.setChannel(4, saVal);
            ProtocolManager.setChannel(5, sbVal);
            ProtocolManager.setChannel(6, scVal);
            ProtocolManager.setChannel(7, sdVal);
            ProtocolManager.setChannel(8, aeroState.pots.S1);
            ProtocolManager.setChannel(9, aeroState.pots.S2);
            ProtocolManager.updateAeroSticks(roll, pitch, throttle, yaw, false);
        }
    }

    function updateLiveAeroVisualizers() {
        const ch = ProtocolManager.getChannels();
        const layoutId = LayoutManager.currentLayoutId;

        if (layoutId === 'drone_quad') {
            const ail = document.getElementById('meter-drone-ail');
            const ele = document.getElementById('meter-drone-ele');
            const thr = document.getElementById('meter-drone-thr');
            const rud = document.getElementById('meter-drone-rud');
            if (ail) ail.innerText = `${ch[0]}µs`;
            if (ele) ele.innerText = `${ch[1]}µs`;
            if (thr) thr.innerText = `${ch[2]}µs`;
            if (rud) rud.innerText = `${ch[3]}µs`;
        } else if (layoutId === 'airplane_wing') {
            const ail = document.getElementById('meter-plane-ail');
            const ele = document.getElementById('meter-plane-ele');
            const thr = document.getElementById('meter-plane-thr');
            const rud = document.getElementById('meter-plane-rud');
            if (ail) ail.innerText = `${ch[0]}µs`;
            if (ele) ele.innerText = `${ch[1]}µs`;
            if (thr) thr.innerText = `${ch[2]}µs`;
            if (rud) rud.innerText = `${ch[3]}µs`;
        } else if (layoutId === 'heli_cp') {
            const ail = document.getElementById('meter-heli-ail');
            const ele = document.getElementById('meter-heli-ele');
            const col = document.getElementById('meter-heli-col');
            const rud = document.getElementById('meter-heli-rud');
            if (ail) ail.innerText = `${ch[0]}µs`;
            if (ele) ele.innerText = `${ch[1]}µs`;
            if (col) col.innerText = `${ch[2]}µs`;
            if (rud) rud.innerText = `${ch[3]}µs`;
        } else if (layoutId === 'rc_transmitter') {
            for (let i = 0; i < 16; i++) {
                const valEl = document.getElementById(`tx-ch-val-${i}`);
                const fillEl = document.getElementById(`tx-ch-fill-${i}`);
                if (valEl) valEl.innerText = `${ch[i]}µs`;
                if (fillEl) {
                    const pct = Math.max(0, Math.min(100, ((ch[i] - 1000) / 1000) * 100));
                    fillEl.style.width = `${pct}%`;
                }
            }
        }
    }

    // ==========================================
    // RENDER ACTIVE LAYOUT & BUTTONS
    // ==========================================
    function renderLayout(layoutId) {
        document.querySelectorAll('.layout-container').forEach(el => el.classList.remove('active'));
        const targetView = document.getElementById(`view-${layoutId}`);
        if (targetView) targetView.classList.add('active');

        const layout = LayoutManager.getCurrent() || (LayoutManager.defaultLayouts && LayoutManager.defaultLayouts[layoutId]) || {};

        // 1. RC Car Buttons
        if (layoutId === 'rc_car' && layout.buttons && Array.isArray(layout.buttons)) {
            const container = document.getElementById('rc-car-buttons');
            if (container) {
                container.innerHTML = '';
                layout.buttons.forEach(btn => container.appendChild(createButtonElement(btn)));
            }
        }

        // 2. Tank Buttons
        if (layoutId === 'tank' && layout.buttons && Array.isArray(layout.buttons)) {
            const container = document.getElementById('tank-buttons');
            if (container) {
                container.innerHTML = '';
                layout.buttons.forEach(btn => container.appendChild(createButtonElement(btn)));
            }
        }

        // 3. Gamepad Buttons
        if (layoutId === 'gamepad' && layout.buttons && Array.isArray(layout.buttons)) {
            const container = document.getElementById('gamepad-buttons');
            if (container) {
                container.innerHTML = '';
                layout.buttons.forEach(btn => container.appendChild(createButtonElement(btn)));
            }
        }

        // 4. Robot Arm Sliders & Buttons
        if (layoutId === 'robot_arm') {
            const sContainer = document.getElementById('robot-sliders');
            if (sContainer) {
                sContainer.innerHTML = '';
                if (layout.servos && Array.isArray(layout.servos)) {
                    layout.servos.forEach(servo => sContainer.appendChild(createSliderElement(servo)));
                }
            }
            const bContainer = document.getElementById('robot-buttons');
            if (bContainer) {
                bContainer.innerHTML = '';
                if (layout.buttons && Array.isArray(layout.buttons)) {
                    layout.buttons.forEach(btn => bContainer.appendChild(createButtonElement(btn)));
                }
            }
        }

        // 5. Custom Matrix / Builder
        if (layoutId === 'custom_matrix') {
            renderCustomBuilder(layout);
        }

        // 6. Terminal Quick Buttons
        if (layoutId === 'terminal') {
            const bar = document.getElementById('terminal-quick-bar');
            if (bar) {
                bar.innerHTML = '';
                if (layout.quickCommands && Array.isArray(layout.quickCommands)) {
                    layout.quickCommands.forEach(cmd => {
                        const btn = document.createElement('button');
                        btn.classList.add('icon-btn');
                        btn.innerText = cmd;
                        btn.addEventListener('click', () => {
                            const formatted = ProtocolManager.formatCommand(cmd);
                            sendPacket(formatted);
                            triggerHaptic(20);
                            playBeep(600, 0.04);
                        });
                        bar.appendChild(btn);
                    });
                }
            }
        }

        // 7. Universal RC Transmitter 16-Channel Visualizer Cards
        if (layoutId === 'rc_transmitter') {
            const container = document.getElementById('tx-channels-bars-container');
            if (container && container.children.length === 0) {
                container.innerHTML = '';
                for (let i = 0; i < 16; i++) {
                    const card = document.createElement('div');
                    card.className = 'tx-ch-card';
                    card.innerHTML = `
                        <div class="tx-ch-header">
                            <span style="color:var(--text-secondary)">CH${i + 1}</span>
                            <span style="color:var(--accent-cyan); font-family:monospace;" id="tx-ch-val-${i}">1500µs</span>
                        </div>
                        <div class="tx-ch-bar-bg">
                            <div class="tx-ch-bar-fill" id="tx-ch-fill-${i}" style="width: 50%;"></div>
                        </div>
                    `;
                    container.appendChild(card);
                }
            }
            const badge = document.getElementById('tx-protocol-badge');
            if (badge) badge.innerText = ProtocolManager.config.format || 'CRSF';
            const mapLbl = document.getElementById('lbl-tx-map');
            if (mapLbl) mapLbl.innerText = ProtocolManager.config.channelMap || 'AETR';
        }
    }

    // ==========================================
    // SETUP AEROMODEL CONTROLS (Drones, Aviões, Helicópteros, Transmissor)
    // ==========================================
    function setupAeromodelControls() {
        if (ProtocolManager.config.stickMode) aeroState.stickMode = ProtocolManager.config.stickMode;
        if (ProtocolManager.config.channelMap) aeroState.channelMap = ProtocolManager.config.channelMap;

        // ------------------------------------------
        // A. DRONE / MULTI-ROTOR CONTROLS
        // ------------------------------------------
        const btnDroneArm = document.getElementById('btn-drone-arm-toggle');
        const droneArmInd = document.getElementById('drone-arm-indicator');
        if (btnDroneArm) {
            btnDroneArm.addEventListener('click', () => {
                aeroState.droneArmed = !aeroState.droneArmed;
                triggerHaptic(40);
                if (aeroState.droneArmed) {
                    playBeep(1200, 0.1, 'square');
                    btnDroneArm.className = 'btn-aero-arm armed';
                    btnDroneArm.innerText = '⚠️ DESARMAR (ARMADO)';
                    if (droneArmInd) {
                        droneArmInd.className = 'aero-pill pill-armed';
                        droneArmInd.innerText = 'ARMED';
                    }
                    logTerminal('DRONE ARMADO - CUIDADO COM AS HÉLICES', 'cmd');
                } else {
                    playBeep(400, 0.1, 'sine');
                    aeroState.throttle = 0;
                    btnDroneArm.className = 'btn-aero-arm disarmed';
                    btnDroneArm.innerText = '🔒 ARMAR MOTORES';
                    if (droneArmInd) {
                        droneArmInd.className = 'aero-pill pill-disarmed';
                        droneArmInd.innerText = 'DISARMED';
                    }
                    logTerminal('DRONE DESARMADO - MOTORES CORTADOS', 'cmd');
                }
            });
        }

        document.querySelectorAll('.btn-drone-mode').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.currentTarget.getAttribute('data-mode') || 'ANGLE';
                aeroState.droneFlightMode = mode;
                document.querySelectorAll('.btn-drone-mode').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                triggerHaptic(20);
                playBeep(850, 0.04);
                logTerminal(`Drone Modo de Voo: ${mode}`, 'cmd');
            });
        });

        const btnBeeper = document.getElementById('btn-drone-beeper');
        if (btnBeeper) {
            btnBeeper.addEventListener('click', () => {
                aeroState.droneBeeper = !aeroState.droneBeeper;
                btnBeeper.classList.toggle('active', aeroState.droneBeeper);
                triggerHaptic(30);
                playBeep(aeroState.droneBeeper ? 1500 : 700, 0.05);
                logTerminal(`Beeper: ${aeroState.droneBeeper ? 'ON' : 'OFF'}`, 'cmd');
            });
        }

        const btnTurtle = document.getElementById('btn-drone-turtle');
        if (btnTurtle) {
            btnTurtle.addEventListener('click', () => {
                aeroState.droneTurtle = !aeroState.droneTurtle;
                btnTurtle.classList.toggle('active', aeroState.droneTurtle);
                triggerHaptic(30);
                playBeep(aeroState.droneTurtle ? 1600 : 500, 0.05);
                logTerminal(`Turtle Mode (Flip Over): ${aeroState.droneTurtle ? 'ATIVO' : 'DESLIGADO'}`, 'cmd');
            });
        }

        // ------------------------------------------
        // B. AIRPLANE / FIXED WING CONTROLS
        // ------------------------------------------
        const btnPlaneCut = document.getElementById('btn-plane-cut-toggle');
        const planeCutInd = document.getElementById('plane-cut-indicator');
        if (btnPlaneCut) {
            btnPlaneCut.addEventListener('click', () => {
                aeroState.planeMotorCut = !aeroState.planeMotorCut;
                triggerHaptic(35);
                if (aeroState.planeMotorCut) {
                    aeroState.throttle = 0;
                    playBeep(450, 0.1);
                    btnPlaneCut.className = 'btn-aero-cut active';
                    btnPlaneCut.innerText = '🛑 CORTE DE MOTOR: ATIVO';
                    if (planeCutInd) {
                        planeCutInd.className = 'aero-pill pill-cut';
                        planeCutInd.innerText = 'MOTOR CORTADO';
                    }
                    logTerminal('Avião: Corte de Motor ATIVADO', 'cmd');
                } else {
                    playBeep(1100, 0.1);
                    btnPlaneCut.className = 'btn-aero-cut';
                    btnPlaneCut.innerText = '🟢 MOTOR LIBERADO';
                    if (planeCutInd) {
                        planeCutInd.className = 'aero-pill pill-armed';
                        planeCutInd.innerText = 'MOTOR LIBERADO';
                    }
                    logTerminal('Avião: Motor LIBERADO para decolagem', 'cmd');
                }
            });
        }

        document.querySelectorAll('.btn-plane-mode').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.currentTarget.getAttribute('data-mode') || 'MANUAL';
                aeroState.planeFlightMode = mode;
                document.querySelectorAll('.btn-plane-mode').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                triggerHaptic(20);
                playBeep(850, 0.04);
                logTerminal(`Avião Modo: ${mode}`, 'cmd');
            });
        });

        document.querySelectorAll('.btn-flap').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const val = parseInt(e.currentTarget.getAttribute('data-val')) || 0;
                aeroState.planeFlaps = val;
                document.querySelectorAll('.btn-flap').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                triggerHaptic(20);
                playBeep(750, 0.04);
                logTerminal(`Flaps: ${val}%`, 'cmd');
            });
        });

        const btnPlaneGear = document.getElementById('btn-plane-gear-toggle');
        if (btnPlaneGear) {
            btnPlaneGear.addEventListener('click', () => {
                aeroState.planeGearDown = !aeroState.planeGearDown;
                triggerHaptic(25);
                playBeep(800, 0.05);
                if (aeroState.planeGearDown) {
                    btnPlaneGear.className = 'btn-gear-toggle down';
                    btnPlaneGear.innerText = 'BAIXADO';
                } else {
                    btnPlaneGear.className = 'btn-gear-toggle up';
                    btnPlaneGear.innerText = 'RECOLHIDO';
                }
                logTerminal(`Trem de Pouso: ${aeroState.planeGearDown ? 'BAIXADO' : 'RECOLHIDO'}`, 'cmd');
            });
        }

        // Digital Trims Binding
        function bindTrim(btnUpId, btnDnId, lblId, key) {
            const btnUp = document.getElementById(btnUpId);
            const btnDn = document.getElementById(btnDnId);
            const lbl = document.getElementById(lblId);

            if (btnUp) {
                btnUp.addEventListener('click', () => {
                    if (aeroState.trims[key] < 20) aeroState.trims[key]++;
                    if (lbl) lbl.innerText = (aeroState.trims[key] > 0 ? '+' : '') + aeroState.trims[key];
                    triggerHaptic(15);
                    playBeep(1000 + aeroState.trims[key] * 20, 0.03);
                });
            }
            if (btnDn) {
                btnDn.addEventListener('click', () => {
                    if (aeroState.trims[key] > -20) aeroState.trims[key]--;
                    if (lbl) lbl.innerText = (aeroState.trims[key] > 0 ? '+' : '') + aeroState.trims[key];
                    triggerHaptic(15);
                    playBeep(1000 + aeroState.trims[key] * 20, 0.03);
                });
            }
        }

        bindTrim('btn-trim-thr-up', 'btn-trim-thr-dn', 'lbl-trim-thr', 'thr');
        bindTrim('btn-trim-rud-rt', 'btn-trim-rud-lf', 'lbl-trim-rud', 'rud');
        bindTrim('btn-trim-ele-up', 'btn-trim-ele-dn', 'lbl-trim-ele', 'ele');
        bindTrim('btn-trim-ail-rt', 'btn-trim-ail-lf', 'lbl-trim-ail', 'ail');

        // ------------------------------------------
        // C. RC HELICOPTER CP CONTROLS
        // ------------------------------------------
        const btnHeliHold = document.getElementById('btn-heli-hold-toggle');
        const heliHoldInd = document.getElementById('heli-hold-indicator');
        if (btnHeliHold) {
            btnHeliHold.addEventListener('click', () => {
                aeroState.heliThrottleHold = !aeroState.heliThrottleHold;
                triggerHaptic(35);
                if (aeroState.heliThrottleHold) {
                    playBeep(450, 0.1);
                    btnHeliHold.className = 'btn-aero-cut active';
                    btnHeliHold.innerText = '🛑 THROTTLE HOLD: ATIVO';
                    if (heliHoldInd) {
                        heliHoldInd.className = 'aero-pill pill-cut';
                        heliHoldInd.innerText = 'HOLD ATIVO';
                    }
                    logTerminal('Helicóptero: Throttle Hold ATIVADO (Motor cortado)', 'cmd');
                } else {
                    playBeep(1100, 0.1);
                    btnHeliHold.className = 'btn-aero-cut';
                    btnHeliHold.innerText = '🟢 MOTOR LIBERADO';
                    if (heliHoldInd) {
                        heliHoldInd.className = 'aero-pill pill-armed';
                        heliHoldInd.innerText = 'HOLD DESLIGADO';
                    }
                    logTerminal('Helicóptero: Motor LIBERADO para voo', 'cmd');
                }
            });
        }

        document.querySelectorAll('.btn-heli-idle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idle = e.currentTarget.getAttribute('data-idle') || 'NORMAL';
                aeroState.heliIdleUp = idle;
                document.querySelectorAll('.btn-heli-idle').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                triggerHaptic(20);
                playBeep(900, 0.04);
                logTerminal(`Helicóptero Idle-Up: ${idle}`, 'cmd');
            });
        });

        const sliderHeliGyro = document.getElementById('slider-heli-gyro');
        if (sliderHeliGyro) {
            sliderHeliGyro.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                aeroState.heliGyroGain = val;
                const lbl = document.getElementById('lbl-heli-gyro');
                if (lbl) lbl.innerText = val >= 50 ? `AVCS ${val}%` : `NORM ${val}%`;
            });
        }

        const btnHeliDr = document.getElementById('btn-heli-dr-toggle');
        if (btnHeliDr) {
            btnHeliDr.addEventListener('click', () => {
                if (aeroState.heliDualRate === 100) {
                    aeroState.heliDualRate = 70;
                    btnHeliDr.innerText = '70% TAME';
                    btnHeliDr.className = 'btn-gear-toggle up';
                } else {
                    aeroState.heliDualRate = 100;
                    btnHeliDr.innerText = '100% SPORT';
                    btnHeliDr.className = 'btn-gear-toggle down';
                }
                triggerHaptic(20);
                playBeep(850, 0.04);
                logTerminal(`Helicóptero Dual Rate: ${aeroState.heliDualRate}%`, 'cmd');
            });
        }

        // ------------------------------------------
        // D. UNIVERSAL RC TRANSMITTER 16CH CONTROLS
        // ------------------------------------------
        const btnTxMode = document.getElementById('btn-tx-toggle-mode');
        if (btnTxMode) {
            btnTxMode.addEventListener('click', () => {
                aeroState.stickMode = aeroState.stickMode === 2 ? 1 : 2;
                ProtocolManager.config.stickMode = aeroState.stickMode;
                btnTxMode.innerText = aeroState.stickMode === 2 ? 'MODO 2 (Esq Thr)' : 'MODO 1 (Dir Thr)';
                const lRole = document.getElementById('lbl-tx-left-role');
                const rRole = document.getElementById('lbl-tx-right-role');
                if (lRole) lRole.innerText = aeroState.stickMode === 2 ? 'Esquerda: Throttle / Rudder' : 'Esquerda: Elevator / Rudder';
                if (rRole) rRole.innerText = aeroState.stickMode === 2 ? 'Direita: Elevator / Aileron' : 'Direita: Throttle / Aileron';
                triggerHaptic(25);
                playBeep(850, 0.04);
                logTerminal(`Transmissor Stick Mode: Modo ${aeroState.stickMode}`, 'cmd');
            });
        }

        document.querySelectorAll('.sw-pos').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const sw = e.currentTarget.getAttribute('data-sw');
                const pos = e.currentTarget.getAttribute('data-pos');
                if (sw && pos) {
                    aeroState.switches[sw] = pos;
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                        parent.querySelectorAll('.sw-pos').forEach(b => b.classList.remove('active'));
                    }
                    e.currentTarget.classList.add('active');
                    triggerHaptic(20);
                    playBeep(950, 0.03);
                    logTerminal(`Switch ${sw}: ${pos}`, 'cmd');
                }
            });
        });

        const potS1 = document.getElementById('tx-pot-s1');
        if (potS1) {
            potS1.addEventListener('input', (e) => {
                aeroState.pots.S1 = parseInt(e.target.value);
            });
        }

        const potS2 = document.getElementById('tx-pot-s2');
        if (potS2) {
            potS2.addEventListener('input', (e) => {
                aeroState.pots.S2 = parseInt(e.target.value);
            });
        }
    }

    setupAeromodelControls();

    function renderCustomBuilder(layout) {
        const canvas = document.getElementById('custom-builder-canvas');
        if (!canvas) return;

        customJoystickInstances = {};
        canvas.innerHTML = '';

        const items = (layout && Array.isArray(layout.items)) ? layout.items : [];
        if (items.length === 0) {
            canvas.innerHTML = `
                <div style="width: 100%; text-align: center; padding: 40px 16px; color: var(--text-secondary); background: var(--bg-surface); border: 1px dashed var(--border-color); border-radius: 12px; margin-top: 10px;">
                    <div style="font-size: 2.2rem; margin-bottom: 8px;">🎨</div>
                    <div style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Nenhum elemento no layout</div>
                    <div style="font-size: 0.85rem; margin-bottom: 16px;">Adicione joysticks, sliders, botões ou espaçadores para montar seu painel de controle.</div>
                    <button id="btn-empty-add" class="btn-primary" style="padding: 8px 18px;">➕ Adicionar Primeiro Elemento</button>
                </div>
            `;
            const btnEmpty = document.getElementById('btn-empty-add');
            if (btnEmpty) {
                btnEmpty.addEventListener('click', () => {
                    const modal = document.getElementById('modal-add-element');
                    if (modal) modal.classList.add('active');
                });
            }
            return;
        }

        items.forEach((item) => {
            const widthClass = item.width === '100%' ? 'width-100' : 'width-50';

            if (item.type === 'joystick') {
                const card = document.createElement('div');
                card.classList.add('builder-item-card', widthClass);
                card.id = `card-${item.id}`;

                const header = document.createElement('div');
                header.classList.add('builder-item-header');
                header.innerHTML = `
                    <span>🕹️ ${item.label || 'Joystick'}</span>
                    <span class="telemetry-val" id="telemetry-${item.id}">X:0 Y:0</span>
                `;
                card.appendChild(header);

                const joyZone = document.createElement('div');
                joyZone.classList.add('joystick-zone');
                joyZone.style.height = '180px';
                joyZone.style.minHeight = '180px';
                joyZone.style.position = 'relative';

                const joyBase = document.createElement('div');
                joyBase.classList.add('joystick-base');
                joyBase.id = `joy-elem-${item.id}`;
                joyZone.appendChild(joyBase);
                card.appendChild(joyZone);
                canvas.appendChild(card);

                // Initialize virtual joystick
                customJoystickValues[item.id] = { x: 0, y: 0 };
                const joy = new VirtualJoystick(`joy-elem-${item.id}`, {
                    axis: item.axis || 'BOTH',
                    autoReturn: item.autoReturn !== false,
                    color: item.color || '#00E5FF',
                    onChange: (x, y) => {
                        customJoystickValues[item.id] = { x, y };
                        const el = document.getElementById(`telemetry-${item.id}`);
                        if (el) el.innerText = `X:${x} Y:${y}`;
                    },
                    onRelease: () => {
                        customJoystickValues[item.id] = { x: 0, y: 0 };
                        const el = document.getElementById(`telemetry-${item.id}`);
                        if (el) el.innerText = 'X:0 Y:0';
                        triggerHaptic(15);
                        const formatted = ProtocolManager.formatCommand(item.cmd || 'JOY', { x: 0, y: 0 });
                        sendPacket(formatted);
                    }
                });
                customJoystickInstances[item.id] = joy;

            } else if (item.type === 'slider') {
                const card = document.createElement('div');
                card.classList.add('builder-item-card', widthClass);
                card.id = `card-${item.id}`;

                const header = document.createElement('div');
                header.classList.add('builder-item-header');
                header.innerHTML = `
                    <span>🎚️ ${item.label || 'Slider'}</span>
                    <span class="telemetry-val" id="telemetry-${item.id}">${item.value !== undefined ? item.value : (item.min || 0)}</span>
                `;
                card.appendChild(header);

                const input = document.createElement('input');
                input.type = 'range';
                input.classList.add('custom-slider');
                input.min = item.min !== undefined ? item.min : 0;
                input.max = item.max !== undefined ? item.max : 255;
                input.value = item.value !== undefined ? item.value : (item.min || 0);
                input.style.width = '100%';
                input.style.marginTop = '6px';

                input.addEventListener('input', (e) => {
                    const val = parseInt(e.target.value);
                    item.value = val;
                    const el = document.getElementById(`telemetry-${item.id}`);
                    if (el) el.innerText = val;
                    const formatted = ProtocolManager.formatCommand(item.cmd || 'SLIDER', { val });
                    sendPacket(formatted);
                });

                card.appendChild(input);
                canvas.appendChild(card);

            } else if (item.type === 'button') {
                const card = document.createElement('div');
                card.classList.add('builder-item-card', widthClass);
                card.id = `card-${item.id}`;
                card.style.justifyContent = 'center';

                const btn = document.createElement('button');
                btn.classList.add('control-btn');
                btn.style.width = '100%';
                btn.style.height = '52px';
                btn.innerText = item.label || 'Botão';
                if (item.color) {
                    btn.style.borderLeft = `5px solid ${item.color}`;
                }

                const isToggle = item.btnType === 'toggle';
                if (isToggle && item.active) {
                    btn.classList.add('active');
                }

                const pressAction = (e) => {
                    e.preventDefault();
                    triggerHaptic(25);
                    playBeep(750, 0.04);

                    if (isToggle) {
                        item.active = !item.active;
                        btn.classList.toggle('active', item.active);
                        const sendVal = item.active ? 1 : 0;
                        const formatted = ProtocolManager.formatCommand(item.cmd || 'BTN', { val: sendVal });
                        sendPacket(formatted);
                    } else {
                        btn.classList.add('active');
                        const formatted = ProtocolManager.formatCommand(item.cmd || 'BTN', { val: 1 });
                        sendPacket(formatted);
                    }
                };

                const releaseAction = (e) => {
                    e.preventDefault();
                    if (!isToggle) {
                        btn.classList.remove('active');
                        const relCmd = item.releaseCmd || item.cmd || 'BTN';
                        const formatted = ProtocolManager.formatCommand(relCmd, { val: 0 });
                        sendPacket(formatted);
                    }
                };

                btn.addEventListener('touchstart', pressAction, { passive: false });
                btn.addEventListener('touchend', releaseAction, { passive: false });
                btn.addEventListener('mousedown', pressAction);
                btn.addEventListener('mouseup', releaseAction);

                card.appendChild(btn);
                canvas.appendChild(card);

            } else if (item.type === 'spacer') {
                const spacer = document.createElement('div');
                spacer.classList.add('builder-section-spacer');
                const height = item.height || 20;
                spacer.style.padding = `${Math.floor(height / 2)}px 0`;

                if (item.label && item.label.trim().length > 0) {
                    spacer.innerHTML = `
                        <div class="builder-section-line"></div>
                        <span class="builder-section-title">${item.label}</span>
                        <div class="builder-section-line"></div>
                    `;
                } else {
                    spacer.innerHTML = `<div class="builder-section-line" style="opacity: 0.3;"></div>`;
                }
                canvas.appendChild(spacer);
            }
        });
    }

    function createButtonElement(btnConfig) {
        const btn = document.createElement('button');
        btn.classList.add('control-btn');
        btn.id = btnConfig.id;
        btn.innerText = btnConfig.label;
        if (btnConfig.color) btn.style.borderLeft = `4px solid ${btnConfig.color}`;

        const isToggle = btnConfig.type === 'toggle';

        const pressAction = (e) => {
            e.preventDefault();
            triggerHaptic(25);
            playBeep(700, 0.05);

            if (isToggle) {
                btnConfig.active = !btnConfig.active;
                btn.classList.toggle('active', btnConfig.active);
                const sendVal = btnConfig.active ? 1 : 0;
                const formatted = ProtocolManager.formatCommand(btnConfig.cmd, { val: sendVal });
                sendPacket(formatted);
            } else {
                btn.classList.add('active');
                const formatted = ProtocolManager.formatCommand(btnConfig.cmd, { val: 1 });
                sendPacket(formatted);
            }
        };

        const releaseAction = (e) => {
            e.preventDefault();
            if (!isToggle) {
                btn.classList.remove('active');
                const relCmd = btnConfig.releaseCmd || btnConfig.cmd;
                const formatted = ProtocolManager.formatCommand(relCmd, { val: 0 });
                sendPacket(formatted);
            }
        };

        btn.addEventListener('touchstart', pressAction, { passive: false });
        btn.addEventListener('touchend', releaseAction, { passive: false });
        btn.addEventListener('mousedown', pressAction);
        btn.addEventListener('mouseup', releaseAction);

        return btn;
    }

    function createSliderElement(sliderConfig) {
        const card = document.createElement('div');
        card.classList.add('slider-card');

        const header = document.createElement('div');
        header.classList.add('slider-header');
        header.innerHTML = `<span>${sliderConfig.label}</span><span id="val-${sliderConfig.id}" class="telemetry-val">${sliderConfig.value}</span>`;

        const input = document.createElement('input');
        input.type = 'range';
        input.classList.add('custom-slider');
        input.min = sliderConfig.min !== undefined ? sliderConfig.min : 0;
        input.max = sliderConfig.max !== undefined ? sliderConfig.max : 180;
        input.value = sliderConfig.value !== undefined ? sliderConfig.value : 90;

        input.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            const valEl = document.getElementById(`val-${sliderConfig.id}`);
            if (valEl) valEl.innerText = val;
            sliderConfig.value = val;
            const formatted = ProtocolManager.formatCommand(sliderConfig.cmd, { val });
            sendPacket(formatted);
        });

        card.appendChild(header);
        card.appendChild(input);
        return card;
    }

    // ==========================================
    // EMERGENCY STOP HANDLER
    // ==========================================
    const btnEmergency = document.getElementById('btn-emergency-stop');
    if (btnEmergency) {
        btnEmergency.addEventListener('click', (e) => {
            if (e) e.preventDefault();
            triggerHaptic(100);
            playBeep(300, 0.2, 'sawtooth');

            // Zero all internal states
            joystickState.throttle = 0;
            joystickState.steering = 0;
            joystickState.leftTrack = 0;
            joystickState.rightTrack = 0;
            joyThrottle.resetPosition();
            joySteering.resetPosition();
            joyTankLeft.resetPosition();
            joyTankRight.resetPosition();
            joyGpLeft.resetPosition();
            joyGpRight.resetPosition();

            // Reset custom joysticks if any
            for (const id in customJoystickInstances) {
                if (customJoystickInstances[id] && typeof customJoystickInstances[id].resetPosition === 'function') {
                    customJoystickInstances[id].resetPosition();
                }
                customJoystickValues[id] = { x: 0, y: 0 };
                const el = document.getElementById('telemetry-' + id);
                if (el) el.innerText = 'X:0 Y:0';
            }

            // Send hard STOP command in multiple formats
            const hardStopCmd = ProtocolManager.formatCommand('STOP', { x: 0, y: 0, val: 0 });
            sendPacket(hardStopCmd);
            sendPacket('S\n'); // Fallback ASCII Stop

            // Flash visual alert
            document.body.style.backgroundColor = '#440011';
            setTimeout(() => document.body.style.backgroundColor = '', 150);
            logTerminal('EMERGENCY STOP ATIVADO - TODOS OS MOTORES ZERADOS', 'err');
        });
    }

    // ==========================================
    // TERMINAL LOG & INPUT
    // ==========================================
    function logTerminal(msg, type = 'rx') {
        const screen = document.getElementById('terminal-screen');
        if (!screen) return;
        const entry = document.createElement('div');
        entry.classList.add('log-entry', type);
        const time = new Date().toLocaleTimeString();
        entry.innerText = `[${time}] ${type.toUpperCase()}: ${msg}`;
        screen.appendChild(entry);
        if (screen.childNodes.length > 100) screen.removeChild(screen.firstChild);
        screen.scrollTop = screen.scrollHeight;
    }

    const btnTermSend = document.getElementById('btn-term-send');
    if (btnTermSend) {
        btnTermSend.addEventListener('click', () => {
            const input = document.getElementById('term-input-cmd');
            const text = input.value.trim();
            if (text) {
                sendPacket(text + '\n');
                input.value = '';
            }
        });
    }

    const btnTermClear = document.getElementById('btn-term-clear');
    if (btnTermClear) {
        btnTermClear.addEventListener('click', () => {
            const screen = document.getElementById('terminal-screen');
            if (screen) screen.innerHTML = '';
        });
    }

    // ==========================================
    // LAYOUT SWITCHER
    // ==========================================
    const selectLayout = document.getElementById('layout-select');
    if (selectLayout) {
        selectLayout.addEventListener('change', (e) => {
            LayoutManager.setLayout(e.target.value);
            renderLayout(e.target.value);
            triggerHaptic(20);
            playBeep(800, 0.03);
        });
    }

    // Render initial layout safely
    renderLayout('rc_car');

    // ==========================================
    // MODALS SETUP HELPER
    // ==========================================
    function setupModal(triggerBtnId, modalId, onOpen) {
        const btn = document.getElementById(triggerBtnId);
        const modal = document.getElementById(modalId);
        if (!btn || !modal) {
            console.warn(`Modal element missing: ${triggerBtnId} or ${modalId}`);
            return;
        }

        const openHandler = (e) => {
            if (e) e.preventDefault();
            modal.classList.add('active');
            if (typeof onOpen === 'function') onOpen();
            triggerHaptic(20);
            playBeep(800, 0.03);
        };

        btn.addEventListener('click', openHandler);

        modal.querySelectorAll('.close-modal').forEach(c => {
            c.addEventListener('click', (e) => {
                if (e) e.preventDefault();
                modal.classList.remove('active');
                triggerHaptic(15);
            });
        });
    }

    // ==========================================
    // 1. MODAL CONEXÃO
    // ==========================================
    setupModal('btn-open-conn', 'modal-conn', () => {
        loadPairedDevices();
    });

    document.querySelectorAll('#modal-conn .tab-btn').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#modal-conn .tab-btn').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('#modal-conn .tab-content').forEach(c => c.style.display = 'none');
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-tab');
            const targetEl = document.getElementById(targetId);
            if (targetEl) targetEl.style.display = 'block';

            if (targetId === 'tab-bt-classic') loadPairedDevices();
            if (targetId === 'tab-usb-otg') loadUsbDevices();
        });
    });

    // ==========================================
    // 2. MODAL PROTOCOLO
    // ==========================================
    setupModal('btn-open-proto', 'modal-proto', () => {
        // Populate active protocol settings
        const cfg = ProtocolManager.config || {};
        const selFormat = document.getElementById('proto-format');
        if (selFormat) selFormat.value = cfg.format || 'DELIMITED';

        const txtTpl = document.getElementById('proto-template');
        if (txtTpl) txtTpl.value = cfg.template || 'RC:{cmd}:{x}:{y}\\n';

        const selChannelMap = document.getElementById('proto-channel-map');
        if (selChannelMap) selChannelMap.value = cfg.channelMap || 'AETR';

        const selStickMode = document.getElementById('proto-stick-mode');
        if (selStickMode) selStickMode.value = String(cfg.stickMode || 2);

        const selEnd = document.getElementById('proto-ending');
        if (selEnd) selEnd.value = cfg.lineEnding || '\\n';

        const selRange = document.getElementById('proto-range');
        if (selRange) selRange.value = cfg.valueRange || 'PERCENT';

        const selRate = document.getElementById('proto-rate');
        if (selRate) selRate.value = String(cfg.txRateMs || 50);

        const txtDeadzone = document.getElementById('proto-deadzone');
        if (txtDeadzone) txtDeadzone.value = cfg.deadzone !== undefined ? cfg.deadzone : 5;

        const chkDiff = document.getElementById('proto-differential');
        if (chkDiff) chkDiff.checked = !!cfg.differentialSteering;

        const chkHaptics = document.getElementById('proto-haptics');
        if (chkHaptics) chkHaptics.checked = hapticsEnabled;

        const grpTpl = document.getElementById('group-template');
        if (grpTpl) grpTpl.style.display = cfg.format === 'TEMPLATE' ? 'block' : 'none';
    });

    const protoFormatSelect = document.getElementById('proto-format');
    if (protoFormatSelect) {
        protoFormatSelect.addEventListener('change', (e) => {
            const grpTpl = document.getElementById('group-template');
            if (grpTpl) grpTpl.style.display = e.target.value === 'TEMPLATE' ? 'block' : 'none';
        });
    }

    const btnSaveProto = document.getElementById('btn-save-proto');
    if (btnSaveProto) {
        btnSaveProto.addEventListener('click', () => {
            ProtocolManager.config.format = document.getElementById('proto-format').value;
            ProtocolManager.config.template = document.getElementById('proto-template').value;

            const selChannelMap = document.getElementById('proto-channel-map');
            if (selChannelMap) {
                ProtocolManager.config.channelMap = selChannelMap.value;
                aeroState.channelMap = selChannelMap.value;
            }
            const selStickMode = document.getElementById('proto-stick-mode');
            if (selStickMode) {
                ProtocolManager.config.stickMode = parseInt(selStickMode.value) || 2;
                aeroState.stickMode = ProtocolManager.config.stickMode;
            }

            ProtocolManager.config.lineEnding = document.getElementById('proto-ending').value;
            ProtocolManager.config.valueRange = document.getElementById('proto-range').value;
            ProtocolManager.config.txRateMs = parseInt(document.getElementById('proto-rate').value) || 50;
            ProtocolManager.config.deadzone = parseInt(document.getElementById('proto-deadzone').value) || 5;
            ProtocolManager.config.differentialSteering = document.getElementById('proto-differential').checked;
            hapticsEnabled = document.getElementById('proto-haptics').checked;

            const badge = document.getElementById('tx-protocol-badge');
            if (badge) badge.innerText = ProtocolManager.config.format || 'CRSF';
            const mapLbl = document.getElementById('lbl-tx-map');
            if (mapLbl) mapLbl.innerText = ProtocolManager.config.channelMap || 'AETR';
            const btnTxMode = document.getElementById('btn-tx-toggle-mode');
            if (btnTxMode) btnTxMode.innerText = aeroState.stickMode === 2 ? 'MODO 2 (Esq Thr)' : 'MODO 1 (Dir Thr)';

            const protoJson = JSON.stringify(ProtocolManager.config);
            if (window.Android && window.Android.saveConfig) {
                window.Android.saveConfig('protocol', protoJson);
            } else {
                localStorage.setItem('omnirc_protocol', protoJson);
            }

            startTxLoop();
            const modal = document.getElementById('modal-proto');
            if (modal) modal.classList.remove('active');
            triggerHaptic(30);
            playBeep(900, 0.05);
        });
    }

    // ==========================================
    // 3. MODAL EDITOR DE LAYOUT
    // ==========================================
    setupModal('btn-open-edit', 'modal-edit', () => {
        populateLayoutEditor();
    });

    function populateLayoutEditor() {
        const body = document.getElementById('layout-editor-body');
        if (!body) return;
        body.innerHTML = '';

        const layout = LayoutManager.getCurrent();
        if (!layout) {
            body.innerHTML = '<div style="color:var(--text-secondary); padding:8px;">Nenhum layout carregado.</div>';
            return;
        }

        const info = document.createElement('div');
        info.innerHTML = `<strong>${layout.name || 'Layout'}</strong><p style="color:var(--text-secondary); font-size:0.8rem; margin-top:2px;">${layout.description || ''}</p>`;
        body.appendChild(info);

        // Edit Custom Items (when layout has items array)
        if (layout.items && Array.isArray(layout.items)) {
            const itemsHeader = document.createElement('div');
            itemsHeader.innerHTML = '<h4 style="margin-top:12px; margin-bottom:6px; color:var(--accent-cyan); font-size:0.9rem;">Elementos do Layout:</h4>';
            body.appendChild(itemsHeader);

            if (layout.items.length === 0) {
                const empty = document.createElement('div');
                empty.style.color = 'var(--text-secondary)';
                empty.style.padding = '8px';
                empty.innerText = 'Nenhum elemento adicionado ainda. Clique em "➕ Adicionar Elemento" abaixo.';
                body.appendChild(empty);
            }

            layout.items.forEach((item, idx) => {
                const card = document.createElement('div');
                card.classList.add('slider-card');
                card.style.gap = '8px';
                card.style.position = 'relative';

                let typeLabel = 'Elemento';
                if (item.type === 'joystick') typeLabel = '🕹️ Joystick';
                else if (item.type === 'slider') typeLabel = '🎚️ Slider';
                else if (item.type === 'button') typeLabel = '🔘 Botão';
                else if (item.type === 'spacer') typeLabel = '📐 Espaçador';

                let specificFields = '';

                if (item.type === 'joystick') {
                    specificFields = `
                        <div class="form-row">
                            <div class="form-group" style="flex:1;">
                                <label>Eixos:</label>
                                <select class="form-control ed-item-axis" data-idx="${idx}">
                                    <option value="BOTH" ${item.axis === 'BOTH' ? 'selected' : ''}>Ambos (X e Y)</option>
                                    <option value="Y_ONLY" ${item.axis === 'Y_ONLY' ? 'selected' : ''}>Somente Y (Vertical)</option>
                                    <option value="X_ONLY" ${item.axis === 'X_ONLY' ? 'selected' : ''}>Somente X (Horizontal)</option>
                                </select>
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label>Retorno Centro:</label>
                                <select class="form-control ed-item-return" data-idx="${idx}">
                                    <option value="true" ${item.autoReturn !== false ? 'selected' : ''}>Sim (Mola)</option>
                                    <option value="false" ${item.autoReturn === false ? 'selected' : ''}>Não (Fixo)</option>
                                </select>
                            </div>
                        </div>
                    `;
                } else if (item.type === 'slider') {
                    specificFields = `
                        <div class="form-row">
                            <div class="form-group" style="flex:1;">
                                <label>Mínimo:</label>
                                <input type="number" class="form-control ed-item-min" data-idx="${idx}" value="${item.min !== undefined ? item.min : 0}">
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label>Máximo:</label>
                                <input type="number" class="form-control ed-item-max" data-idx="${idx}" value="${item.max !== undefined ? item.max : 255}">
                            </div>
                        </div>
                    `;
                } else if (item.type === 'button') {
                    specificFields = `
                        <div class="form-row">
                            <div class="form-group" style="flex:1;">
                                <label>Tipo:</label>
                                <select class="form-control ed-item-btntype" data-idx="${idx}">
                                    <option value="momentary" ${item.btnType !== 'toggle' ? 'selected' : ''}>Momentâneo</option>
                                    <option value="toggle" ${item.btnType === 'toggle' ? 'selected' : ''}>Alternar (Toggle)</option>
                                </select>
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label>Cmd ao Soltar:</label>
                                <input type="text" class="form-control ed-item-rel" data-idx="${idx}" value="${item.releaseCmd || ''}" placeholder="(opcional)">
                            </div>
                        </div>
                    `;
                } else if (item.type === 'spacer') {
                    specificFields = `
                        <div class="form-group">
                            <label>Altura (px):</label>
                            <input type="number" class="form-control ed-item-height" data-idx="${idx}" value="${item.height || 20}">
                        </div>
                    `;
                }

                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong>#${idx + 1} ${typeLabel}</strong>
                        <div style="display:flex; gap:4px;">
                            ${idx > 0 ? `<button type="button" class="icon-btn ed-item-up" data-idx="${idx}" title="Mover para Cima">⬆️</button>` : ''}
                            ${idx < layout.items.length - 1 ? `<button type="button" class="icon-btn ed-item-down" data-idx="${idx}" title="Mover para Baixo">⬇️</button>` : ''}
                            <button type="button" class="icon-btn ed-item-del" data-idx="${idx}" style="color:var(--accent-red);" title="Excluir">🗑️</button>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group" style="flex:1;">
                            <label>Rótulo / Nome:</label>
                            <input type="text" class="form-control ed-item-label" data-idx="${idx}" value="${item.label || ''}">
                        </div>
                        ${item.type !== 'spacer' ? `
                        <div class="form-group" style="flex:1;">
                            <label>Comando no Protocolo:</label>
                            <input type="text" class="form-control ed-item-cmd" data-idx="${idx}" value="${item.cmd || ''}">
                        </div>
                        ` : ''}
                    </div>
                    <div class="form-row">
                        <div class="form-group" style="flex:1;">
                            <label>Largura no Layout:</label>
                            <select class="form-control ed-item-width" data-idx="${idx}">
                                <option value="50%" ${item.width === '50%' ? 'selected' : ''}>50% (Meia linha)</option>
                                <option value="100%" ${item.width === '100%' ? 'selected' : ''}>100% (Linha inteira)</option>
                            </select>
                        </div>
                    </div>
                    ${specificFields}
                `;
                body.appendChild(card);
            });

            // Bind delete and reorder buttons
            body.querySelectorAll('.ed-item-del').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.currentTarget.getAttribute('data-idx'));
                    layout.items.splice(idx, 1);
                    LayoutManager.saveCurrent(layout);
                    populateLayoutEditor();
                    if (LayoutManager.currentLayoutId === 'custom_matrix') {
                        renderLayout('custom_matrix');
                    }
                    triggerHaptic(20);
                });
            });

            body.querySelectorAll('.ed-item-up').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.currentTarget.getAttribute('data-idx'));
                    if (idx > 0) {
                        const temp = layout.items[idx];
                        layout.items[idx] = layout.items[idx - 1];
                        layout.items[idx - 1] = temp;
                        LayoutManager.saveCurrent(layout);
                        populateLayoutEditor();
                        if (LayoutManager.currentLayoutId === 'custom_matrix') {
                            renderLayout('custom_matrix');
                        }
                    }
                });
            });

            body.querySelectorAll('.ed-item-down').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.currentTarget.getAttribute('data-idx'));
                    if (idx < layout.items.length - 1) {
                        const temp = layout.items[idx];
                        layout.items[idx] = layout.items[idx + 1];
                        layout.items[idx + 1] = temp;
                        LayoutManager.saveCurrent(layout);
                        populateLayoutEditor();
                        if (LayoutManager.currentLayoutId === 'custom_matrix') {
                            renderLayout('custom_matrix');
                        }
                    }
                });
            });
        }

        // Edit Legacy Buttons
        if (layout.buttons && Array.isArray(layout.buttons)) {
            const btnHeader = document.createElement('div');
            btnHeader.innerHTML = '<h4 style="margin-top:12px; margin-bottom:6px; color:var(--accent-cyan); font-size:0.9rem;">Botões de Controle:</h4>';
            body.appendChild(btnHeader);

            layout.buttons.forEach((btn, idx) => {
                const card = document.createElement('div');
                card.classList.add('slider-card');
                card.style.gap = '8px';
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong>Botão #${idx + 1} (${btn.id})</strong>
                        <span style="font-size:0.75rem; color:${btn.color || 'var(--accent-cyan)'}">■ Cor</span>
                    </div>
                    <div class="form-row">
                        <div class="form-group" style="flex:1;">
                            <label>Rótulo / Nome:</label>
                            <input type="text" class="form-control ed-btn-label" data-idx="${idx}" value="${btn.label}">
                        </div>
                        <div class="form-group" style="flex:1;">
                            <label>Comando Enviado:</label>
                            <input type="text" class="form-control ed-btn-cmd" data-idx="${idx}" value="${btn.cmd}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group" style="flex:1;">
                            <label>Tipo:</label>
                            <select class="form-control ed-btn-type" data-idx="${idx}">
                                <option value="momentary" ${btn.type !== 'toggle' ? 'selected' : ''}>Momentâneo (Segurar)</option>
                                <option value="toggle" ${btn.type === 'toggle' ? 'selected' : ''}>Alternar (Liga/Desliga)</option>
                            </select>
                        </div>
                        <div class="form-group" style="flex:1;">
                            <label>Cmd ao Soltar (Opcional):</label>
                            <input type="text" class="form-control ed-btn-rel" data-idx="${idx}" value="${btn.releaseCmd || ''}" placeholder="(mesmo cmd val 0)">
                        </div>
                    </div>
                `;
                body.appendChild(card);
            });
        }

        // Edit Legacy Sliders
        const sliderList = layout.servos || layout.sliders;
        if (sliderList && Array.isArray(sliderList)) {
            const slHeader = document.createElement('div');
            slHeader.innerHTML = '<h4 style="margin-top:12px; margin-bottom:6px; color:var(--accent-cyan); font-size:0.9rem;">Controles Deslizantes / Servos:</h4>';
            body.appendChild(slHeader);

            sliderList.forEach((sl, idx) => {
                const card = document.createElement('div');
                card.classList.add('slider-card');
                card.style.gap = '8px';
                card.innerHTML = `
                    <strong>Slider #${idx + 1} (${sl.id})</strong>
                    <div class="form-row">
                        <div class="form-group" style="flex:1;">
                            <label>Nome:</label>
                            <input type="text" class="form-control ed-sl-label" data-idx="${idx}" value="${sl.label}">
                        </div>
                        <div class="form-group" style="flex:1;">
                            <label>Comando:</label>
                            <input type="text" class="form-control ed-sl-cmd" data-idx="${idx}" value="${sl.cmd}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group" style="flex:1;">
                            <label>Mínimo:</label>
                            <input type="number" class="form-control ed-sl-min" data-idx="${idx}" value="${sl.min || 0}">
                        </div>
                        <div class="form-group" style="flex:1;">
                            <label>Máximo:</label>
                            <input type="number" class="form-control ed-sl-max" data-idx="${idx}" value="${sl.max || 180}">
                        </div>
                    </div>
                `;
                body.appendChild(card);
            });
        }
    }

    const btnSaveLayout = document.getElementById('btn-save-layout');
    if (btnSaveLayout) {
        btnSaveLayout.addEventListener('click', () => {
            const layout = LayoutManager.getCurrent();
            if (!layout) return;

            // Save Custom Items
            if (layout.items && Array.isArray(layout.items)) {
                document.querySelectorAll('.ed-item-label').forEach(inp => {
                    const idx = parseInt(inp.getAttribute('data-idx'));
                    if (layout.items[idx]) layout.items[idx].label = inp.value;
                });
                document.querySelectorAll('.ed-item-cmd').forEach(inp => {
                    const idx = parseInt(inp.getAttribute('data-idx'));
                    if (layout.items[idx]) layout.items[idx].cmd = inp.value;
                });
                document.querySelectorAll('.ed-item-width').forEach(inp => {
                    const idx = parseInt(inp.getAttribute('data-idx'));
                    if (layout.items[idx]) layout.items[idx].width = inp.value;
                });
                document.querySelectorAll('.ed-item-axis').forEach(inp => {
                    const idx = parseInt(inp.getAttribute('data-idx'));
                    if (layout.items[idx]) layout.items[idx].axis = inp.value;
                });
                document.querySelectorAll('.ed-item-return').forEach(inp => {
                    const idx = parseInt(inp.getAttribute('data-idx'));
                    if (layout.items[idx]) layout.items[idx].autoReturn = inp.value === 'true';
                });
                document.querySelectorAll('.ed-item-min').forEach(inp => {
                    const idx = parseInt(inp.getAttribute('data-idx'));
                    if (layout.items[idx]) layout.items[idx].min = parseInt(inp.value) || 0;
                });
                document.querySelectorAll('.ed-item-max').forEach(inp => {
                    const idx = parseInt(inp.getAttribute('data-idx'));
                    if (layout.items[idx]) layout.items[idx].max = parseInt(inp.value) || 180;
                });
                document.querySelectorAll('.ed-item-btntype').forEach(inp => {
                    const idx = parseInt(inp.getAttribute('data-idx'));
                    if (layout.items[idx]) layout.items[idx].btnType = inp.value;
                });
                document.querySelectorAll('.ed-item-rel').forEach(inp => {
                    const idx = parseInt(inp.getAttribute('data-idx'));
                    if (layout.items[idx]) layout.items[idx].releaseCmd = inp.value.trim();
                });
                document.querySelectorAll('.ed-item-height').forEach(inp => {
                    const idx = parseInt(inp.getAttribute('data-idx'));
                    if (layout.items[idx]) layout.items[idx].height = parseInt(inp.value) || 20;
                });
            }

            // Save Buttons
            if (layout.buttons && Array.isArray(layout.buttons)) {
                document.querySelectorAll('.ed-btn-label').forEach(inp => {
                    const idx = parseInt(inp.getAttribute('data-idx'));
                    if (layout.buttons[idx]) layout.buttons[idx].label = inp.value;
                });
                document.querySelectorAll('.ed-btn-cmd').forEach(inp => {
                    const idx = parseInt(inp.getAttribute('data-idx'));
                    if (layout.buttons[idx]) layout.buttons[idx].cmd = inp.value;
                });
                document.querySelectorAll('.ed-btn-type').forEach(inp => {
                    const idx = parseInt(inp.getAttribute('data-idx'));
                    if (layout.buttons[idx]) layout.buttons[idx].type = inp.value;
                });
                document.querySelectorAll('.ed-btn-rel').forEach(inp => {
                    const idx = parseInt(inp.getAttribute('data-idx'));
                    if (layout.buttons[idx]) layout.buttons[idx].releaseCmd = inp.value.trim();
                });
            }

            // Save Sliders
            const sliderList = layout.servos || layout.sliders;
            if (sliderList && Array.isArray(sliderList)) {
                document.querySelectorAll('.ed-sl-label').forEach(inp => {
                    const idx = parseInt(inp.getAttribute('data-idx'));
                    if (sliderList[idx]) sliderList[idx].label = inp.value;
                });
                document.querySelectorAll('.ed-sl-cmd').forEach(inp => {
                    const idx = parseInt(inp.getAttribute('data-idx'));
                    if (sliderList[idx]) sliderList[idx].cmd = inp.value;
                });
                document.querySelectorAll('.ed-sl-min').forEach(inp => {
                    const idx = parseInt(inp.getAttribute('data-idx'));
                    if (sliderList[idx]) sliderList[idx].min = parseInt(inp.value) || 0;
                });
                document.querySelectorAll('.ed-sl-max').forEach(inp => {
                    const idx = parseInt(inp.getAttribute('data-idx'));
                    if (sliderList[idx]) sliderList[idx].max = parseInt(inp.value) || 180;
                });
            }

            LayoutManager.saveCurrent(layout);
            renderLayout(LayoutManager.currentLayoutId);

            const modal = document.getElementById('modal-edit');
            if (modal) modal.classList.remove('active');
            triggerHaptic(30);
            playBeep(900, 0.05);
        });
    }

    const btnResetLayout = document.getElementById('btn-reset-layout');
    if (btnResetLayout) {
        btnResetLayout.addEventListener('click', () => {
            LayoutManager.resetToDefault(LayoutManager.currentLayoutId);
            renderLayout(LayoutManager.currentLayoutId);
            populateLayoutEditor();
            triggerHaptic(40);
            playBeep(500, 0.08);
        });
    }

    // ==========================================
    // 4. MODAL ADICIONAR ELEMENTO PERSONALIZADO
    // ==========================================
    setupModal('btn-add-element-bar', 'modal-add-element');

    const btnManageLayout = document.getElementById('btn-manage-layout');
    if (btnManageLayout) {
        btnManageLayout.addEventListener('click', () => {
            const modal = document.getElementById('modal-edit');
            if (modal) {
                modal.classList.add('active');
                populateLayoutEditor();
            }
            triggerHaptic(20);
            playBeep(800, 0.03);
        });
    }

    const btnAddNewFromEdit = document.getElementById('btn-add-new-from-edit');
    if (btnAddNewFromEdit) {
        btnAddNewFromEdit.addEventListener('click', () => {
            const modalEdit = document.getElementById('modal-edit');
            if (modalEdit) modalEdit.classList.remove('active');
            const modalAdd = document.getElementById('modal-add-element');
            if (modalAdd) modalAdd.classList.add('active');
            triggerHaptic(20);
            playBeep(800, 0.03);
        });
    }

    const selectNewType = document.getElementById('new-el-type');
    if (selectNewType) {
        selectNewType.addEventListener('change', (e) => {
            const type = e.target.value;
            const secJoy = document.getElementById('section-opt-joystick');
            const secSl = document.getElementById('section-opt-slider');
            const secBtn = document.getElementById('section-opt-button');
            const secSp = document.getElementById('section-opt-spacer');

            if (secJoy) secJoy.style.display = type === 'joystick' ? 'flex' : 'none';
            if (secSl) secSl.style.display = type === 'slider' ? 'flex' : 'none';
            if (secBtn) secBtn.style.display = type === 'button' ? 'block' : 'none';
            if (secSp) secSp.style.display = type === 'spacer' ? 'block' : 'none';

            const inputLabel = document.getElementById('new-el-label');
            const inputCmd = document.getElementById('new-el-cmd');
            if (inputLabel && inputCmd) {
                if (type === 'joystick') {
                    inputLabel.value = 'Novo Joystick';
                    inputCmd.value = 'JOY';
                } else if (type === 'slider') {
                    inputLabel.value = 'Novo Slider';
                    inputCmd.value = 'SERVO';
                } else if (type === 'button') {
                    inputLabel.value = 'Novo Botão';
                    inputCmd.value = 'CMD';
                } else if (type === 'spacer') {
                    inputLabel.value = 'Nova Seção';
                    inputCmd.value = '';
                }
            }
        });
    }

    const btnConfirmAdd = document.getElementById('btn-confirm-add-element');
    if (btnConfirmAdd) {
        btnConfirmAdd.addEventListener('click', () => {
            const type = document.getElementById('new-el-type').value;
            const label = document.getElementById('new-el-label').value.trim();
            const cmd = document.getElementById('new-el-cmd').value.trim();
            const width = document.getElementById('new-el-width').value;

            const id = 'c_' + Date.now();
            let newItem = null;

            if (type === 'joystick') {
                const axis = document.getElementById('new-joy-axis').value;
                const autoReturn = document.getElementById('new-joy-return').value === 'true';
                newItem = {
                    id,
                    type: 'joystick',
                    label: label || 'Joystick',
                    cmd: cmd || 'JOY',
                    axis,
                    autoReturn,
                    width,
                    color: '#00E5FF'
                };
            } else if (type === 'slider') {
                const min = parseInt(document.getElementById('new-sl-min').value) || 0;
                const max = parseInt(document.getElementById('new-sl-max').value) || 180;
                const val = parseInt(document.getElementById('new-sl-val').value) || min;
                newItem = {
                    id,
                    type: 'slider',
                    label: label || 'Slider',
                    cmd: cmd || 'SLD',
                    min,
                    max,
                    value: val,
                    width
                };
            } else if (type === 'button') {
                const btnType = document.getElementById('new-btn-type').value;
                const releaseCmd = document.getElementById('new-btn-rel').value.trim();
                const color = document.getElementById('new-btn-color').value;
                newItem = {
                    id,
                    type: 'button',
                    label: label || 'Botão',
                    cmd: cmd || 'BTN',
                    releaseCmd,
                    btnType,
                    active: false,
                    color,
                    width
                };
            } else if (type === 'spacer') {
                const height = parseInt(document.getElementById('new-sp-height').value) || 24;
                newItem = {
                    id,
                    type: 'spacer',
                    label: label,
                    height,
                    width: '100%'
                };
            }

            if (newItem) {
                if (!LayoutManager.layouts.custom_matrix) {
                    LayoutManager.layouts.custom_matrix = JSON.parse(JSON.stringify(LayoutManager.defaultLayouts.custom_matrix));
                }
                const cm = LayoutManager.layouts.custom_matrix;
                if (!Array.isArray(cm.items)) cm.items = [];
                cm.items.push(newItem);

                LayoutManager.saveCurrent(cm);
                if (LayoutManager.currentLayoutId === 'custom_matrix') {
                    renderLayout('custom_matrix');
                }

                const modalAdd = document.getElementById('modal-add-element');
                if (modalAdd) modalAdd.classList.remove('active');

                triggerHaptic(30);
                playBeep(900, 0.05);
            }
        });
    }

    // ==========================================
    // BLUETOOTH PAIRING & SCANNING
    // ==========================================
    function loadPairedDevices() {
        const listEl = document.getElementById('list-paired-devices');
        if (!listEl) return;

        if (window.Android && window.Android.getPairedDevicesJson) {
            try {
                const json = window.Android.getPairedDevicesJson();
                const devices = JSON.parse(json);
                listEl.innerHTML = '';
                if (!devices || devices.length === 0) {
                    listEl.innerHTML = '<div style="color:var(--text-secondary); padding:8px;">Nenhum dispositivo pareado encontrado no Android.</div>';
                    return;
                }
                devices.forEach(dev => {
                    const item = document.createElement('div');
                    item.classList.add('device-item');
                    item.innerHTML = `<div><strong>${dev.name}</strong><br><small style="color:var(--text-secondary)">${dev.address}</small></div><button class="btn-primary" style="padding:4px 10px; font-size:0.75rem;">Conectar</button>`;
                    item.querySelector('button').addEventListener('click', () => {
                        window.Android.connectBluetooth('CLASSIC', dev.address);
                        const modal = document.getElementById('modal-conn');
                        if (modal) modal.classList.remove('active');
                    });
                    listEl.appendChild(item);
                });
            } catch (e) {
                listEl.innerHTML = '<div style="color:var(--accent-red); padding:8px;">Erro ao carregar dispositivos.</div>';
            }
        } else {
            listEl.innerHTML = '<div style="color:var(--text-secondary); padding:8px;">Disponível ao executar no dispositivo Android.</div>';
        }
    }

    const btnRefreshPaired = document.getElementById('btn-refresh-paired');
    if (btnRefreshPaired) {
        btnRefreshPaired.addEventListener('click', loadPairedDevices);
    }

    const btnScanClassic = document.getElementById('btn-scan-classic');
    if (btnScanClassic) {
        btnScanClassic.addEventListener('click', () => {
            if (window.Android && window.Android.scanBluetooth) {
                const discEl = document.getElementById('list-discovered-devices');
                if (discEl) discEl.innerHTML = '<div style="color:var(--accent-cyan); padding:8px;">Escaneando Bluetooth Classic...</div>';
                window.Android.scanBluetooth('CLASSIC');
            }
        });
    }

    const btnScanBle = document.getElementById('btn-scan-ble');
    if (btnScanBle) {
        btnScanBle.addEventListener('click', () => {
            if (window.Android && window.Android.scanBluetooth) {
                const bleEl = document.getElementById('list-ble-devices');
                if (bleEl) bleEl.innerHTML = '<div style="color:var(--accent-cyan); padding:8px;">Escaneando Bluetooth Low Energy (BLE)...</div>';
                window.Android.scanBluetooth('BLE');
            }
        });
    }

    // ==========================================
    // USB OTG RADIO ADAPTER CONTROLS
    // ==========================================
    function loadUsbDevices() {
        const selectEl = document.getElementById('usb-device-select');
        const statusEl = document.getElementById('usb-device-status-info');
        if (!selectEl) return;

        if (window.Android && window.Android.getUsbDevicesJson) {
            try {
                const json = window.Android.getUsbDevicesJson();
                const devices = JSON.parse(json);
                selectEl.innerHTML = '';
                if (!devices || devices.length === 0) {
                    selectEl.innerHTML = '<option value="-1">Nenhum adaptador USB/OTG conectado. Plugue o cabo OTG e clique em Escanear.</option>';
                    if (statusEl) statusEl.innerText = 'Nenhum rádio detectado via USB';
                    return;
                }

                devices.forEach(dev => {
                    const opt = document.createElement('option');
                    opt.value = dev.deviceId;
                    const chip = dev.driverType || 'Serial USB';
                    const name = dev.productName || dev.deviceName || `Dispositivo USB #${dev.deviceId}`;
                    opt.innerText = `${name} [${chip} - VID:0x${dev.vendorId ? dev.vendorId.toString(16) : '????'}]`;
                    selectEl.appendChild(opt);
                });
                if (statusEl) statusEl.innerText = `${devices.length} dispositivo(s) OTG pronto(s)`;
            } catch (e) {
                selectEl.innerHTML = '<option value="-1">Erro ao listar rádios USB.</option>';
                if (statusEl) statusEl.innerText = 'Erro na comunicação USB';
            }
        } else {
            selectEl.innerHTML = '<option value="-1">Disponível no app Android com cabo OTG conectado.</option>';
            if (statusEl) statusEl.innerText = 'Requer Android + cabo OTG';
        }
    }

    const btnScanUsb = document.getElementById('btn-scan-usb');
    if (btnScanUsb) {
        btnScanUsb.addEventListener('click', () => {
            loadUsbDevices();
            triggerHaptic(20);
            playBeep(750, 0.04);
        });
    }

    // Connect Confirmation (Wi-Fi and USB-OTG)
    const btnConfirmConnect = document.getElementById('btn-confirm-connect');
    if (btnConfirmConnect) {
        btnConfirmConnect.addEventListener('click', () => {
            const activeTabBtn = document.querySelector('#modal-conn .tab-btn.active');
            const activeTab = activeTabBtn ? activeTabBtn.getAttribute('data-tab') : 'tab-wifi';

            if (activeTab === 'tab-wifi') {
                const mode = document.getElementById('wifi-type').value;
                const host = document.getElementById('wifi-host').value.trim();
                const port = parseInt(document.getElementById('wifi-port').value) || 8888;

                if (window.Android && window.Android.connectWifi) {
                    window.Android.connectWifi(mode, host, port);
                }
                const modal = document.getElementById('modal-conn');
                if (modal) modal.classList.remove('active');
            } else if (activeTab === 'tab-usb-otg') {
                const selDev = document.getElementById('usb-device-select');
                const deviceId = selDev ? parseInt(selDev.value) : -1;
                const baudRate = parseInt(document.getElementById('usb-baud-rate').value) || 115200;

                if (deviceId >= 0 && window.Android && window.Android.connectUsb) {
                    window.Android.connectUsb(deviceId, baudRate);
                    logTerminal(`Conectando Rádio USB OTG (ID: ${deviceId}, ${baudRate} bps)...`, 'cmd');
                } else if (deviceId < 0) {
                    logTerminal('Selecione ou conecte um rádio USB/OTG válido', 'err');
                }
                const modal = document.getElementById('modal-conn');
                if (modal) modal.classList.remove('active');
            }
        });
    }

    const btnDisconnectAll = document.getElementById('btn-disconnect-all');
    if (btnDisconnectAll) {
        btnDisconnectAll.addEventListener('click', () => {
            if (window.Android && window.Android.disconnect) {
                window.Android.disconnect();
            }
            const modal = document.getElementById('modal-conn');
            if (modal) modal.classList.remove('active');
        });
    }

    // ==========================================
    // NATIVE ANDROID EVENT HANDLERS
    // ==========================================
    window.onNativeStatus = (status, details) => {
        const badge = document.getElementById('status-badge');
        const text = document.getElementById('status-text');

        if (badge && text) {
            badge.className = 'status-indicator';
            if (status === 'CONNECTED') {
                badge.classList.add('connected');
                text.innerText = details || 'Conectado';
                playBeep(1000, 0.1);
            } else if (status === 'CONNECTING') {
                badge.classList.add('connecting');
                text.innerText = details || 'Conectando...';
            } else {
                text.innerText = details || 'Desconectado';
            }
        }
        logTerminal(`[Status] ${status}: ${details}`, 'rx');
    };

    window.onNativeData = (data) => {
        logTerminal(data, 'rx');
    };

    window.onNativeError = (err) => {
        logTerminal(`[Erro] ${err}`, 'err');
        triggerHaptic(50);
    };

    window.onNativeDeviceFound = (name, address, type, rssi) => {
        const container = type === 'BLE' ? 
            document.getElementById('list-ble-devices') : 
            document.getElementById('list-discovered-devices');

        if (!container) return;

        // Check if item already exists
        const existing = container.querySelector(`[data-addr="${address}"]`);
        if (existing) return;

        const item = document.createElement('div');
        item.classList.add('device-item');
        item.setAttribute('data-addr', address);
        item.innerHTML = `<div><strong>${name}</strong><br><small style="color:var(--text-secondary)">${address} ${rssi ? `(${rssi} dBm)` : ''}</small></div><button class="btn-primary" style="padding:4px 10px; font-size:0.75rem;">Conectar</button>`;

        item.querySelector('button').addEventListener('click', () => {
            if (window.Android && window.Android.connectBluetooth) {
                window.Android.connectBluetooth(type, address);
            }
            const modal = document.getElementById('modal-conn');
            if (modal) modal.classList.remove('active');
        });

        container.appendChild(item);
    };

    window.onNativeUsbEvent = (evt, name) => {
        loadUsbDevices();
        logTerminal(`[USB-OTG] Dispositivo ${evt}: ${name}`, 'rx');
        triggerHaptic(40);
        playBeep(evt === 'ATTACHED' ? 1200 : 500, 0.08);
    };

    // ==========================================
    // 5. SENSORES DE MOVIMENTO (GIROSCÓPIO / TILT)
    // ==========================================
    let sensorsEnabled = false;
    let sensorMode = 'drive';
    let sensorSensitivity = 1.2;
    let sensorDeadzone = 4;
    let sensorInvertX = false;
    let sensorInvertY = false;
    let sensorCalibration = { pitch: 0, roll: 0, yaw: 0 };
    let currentSensorValues = { pitch: 0, roll: 0, yaw: 0, ax: 0, ay: 0, az: 0 };

    try {
        const savedSensors = window.Android && window.Android.loadConfig ? 
            window.Android.loadConfig('sensors', null) : localStorage.getItem('omnirc_sensors');
        if (savedSensors) {
            const sc = JSON.parse(savedSensors);
            sensorsEnabled = !!sc.enabled;
            sensorMode = sc.mode || 'drive';
            sensorSensitivity = sc.sens !== undefined ? sc.sens : 1.2;
            sensorDeadzone = sc.deadzone !== undefined ? sc.deadzone : 4;
            sensorInvertX = !!sc.invX;
            sensorInvertY = !!sc.invY;
            if (sc.calib) sensorCalibration = sc.calib;
        }
    } catch (e) {}

    setupModal('btn-open-sensors', 'modal-sensors', () => {
        const chkEnable = document.getElementById('sensor-enable-toggle');
        if (chkEnable) chkEnable.checked = sensorsEnabled;
        const selMode = document.getElementById('sensor-mode-select');
        if (selMode) selMode.value = sensorMode;
        const sldSens = document.getElementById('sensor-sens-slider');
        if (sldSens) {
            sldSens.value = Math.round(sensorSensitivity * 10);
            const val = document.getElementById('sensor-sens-val');
            if (val) val.innerText = `${sensorSensitivity.toFixed(1)}x`;
        }
        const sldDead = document.getElementById('sensor-dead-slider');
        if (sldDead) {
            sldDead.value = sensorDeadzone;
            const val = document.getElementById('sensor-dead-val');
            if (val) val.innerText = `${sensorDeadzone}°`;
        }
        const chkInvX = document.getElementById('sensor-invert-x');
        if (chkInvX) chkInvX.checked = sensorInvertX;
        const chkInvY = document.getElementById('sensor-invert-y');
        if (chkInvY) chkInvY.checked = sensorInvertY;
    });

    const sldSensInput = document.getElementById('sensor-sens-slider');
    if (sldSensInput) {
        sldSensInput.addEventListener('input', (e) => {
            const val = parseInt(e.target.value) / 10;
            const txt = document.getElementById('sensor-sens-val');
            if (txt) txt.innerText = `${val.toFixed(1)}x`;
        });
    }

    const sldDeadInput = document.getElementById('sensor-dead-slider');
    if (sldDeadInput) {
        sldDeadInput.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            const txt = document.getElementById('sensor-dead-val');
            if (txt) txt.innerText = `${val}°`;
        });
    }

    const btnCalibrate = document.getElementById('btn-sensor-calibrate');
    if (btnCalibrate) {
        btnCalibrate.addEventListener('click', () => {
            sensorCalibration.pitch = currentSensorValues.pitch;
            sensorCalibration.roll = currentSensorValues.roll;
            sensorCalibration.yaw = currentSensorValues.yaw;
            triggerHaptic(30);
            playBeep(900, 0.05);
            logTerminal('Sensores calibrados na posição atual', 'cmd');
        });
    }

    const btnSaveSensors = document.getElementById('btn-save-sensors');
    if (btnSaveSensors) {
        btnSaveSensors.addEventListener('click', () => {
            sensorsEnabled = document.getElementById('sensor-enable-toggle').checked;
            sensorMode = document.getElementById('sensor-mode-select').value;
            sensorSensitivity = parseInt(document.getElementById('sensor-sens-slider').value) / 10;
            sensorDeadzone = parseInt(document.getElementById('sensor-dead-slider').value);
            sensorInvertX = document.getElementById('sensor-invert-x').checked;
            sensorInvertY = document.getElementById('sensor-invert-y').checked;

            const cfg = {
                enabled: sensorsEnabled,
                mode: sensorMode,
                sens: sensorSensitivity,
                deadzone: sensorDeadzone,
                invX: sensorInvertX,
                invY: sensorInvertY,
                calib: sensorCalibration
            };
            const serialized = JSON.stringify(cfg);
            if (window.Android && window.Android.saveConfig) {
                window.Android.saveConfig('sensors', serialized);
            } else {
                localStorage.setItem('omnirc_sensors', serialized);
            }

            if (sensorsEnabled) {
                if (window.Android && window.Android.startSensors) {
                    window.Android.startSensors(50);
                }
                logTerminal(`Controle por Sensores Ativado (${sensorMode})`, 'cmd');
            } else {
                if (window.Android && window.Android.stopSensors) {
                    window.Android.stopSensors();
                }
                logTerminal('Controle por Sensores Desativado', 'cmd');
            }

            const modal = document.getElementById('modal-sensors');
            if (modal) modal.classList.remove('active');
            triggerHaptic(30);
            playBeep(850, 0.05);
        });
    }

    function processSensorValues(pitch, roll, yaw, ax, ay, az) {
        currentSensorValues = { pitch, roll, yaw, ax, ay, az };

        const elPitch = document.getElementById('sensor-val-pitch');
        if (elPitch) elPitch.innerText = `${pitch.toFixed(1)}°`;
        const elRoll = document.getElementById('sensor-val-roll');
        if (elRoll) elRoll.innerText = `${roll.toFixed(1)}°`;
        const elYaw = document.getElementById('sensor-val-yaw');
        if (elYaw) elYaw.innerText = `${yaw.toFixed(1)}°`;

        if (!sensorsEnabled) return;

        let diffRoll = (roll - sensorCalibration.roll) * (sensorInvertX ? -1 : 1);
        let diffPitch = (pitch - sensorCalibration.pitch) * (sensorInvertY ? -1 : 1);

        if (Math.abs(diffRoll) < sensorDeadzone) diffRoll = 0;
        if (Math.abs(diffPitch) < sensorDeadzone) diffPitch = 0;

        let steerVal = Math.round((diffRoll / 35) * 100 * sensorSensitivity);
        let throttleVal = Math.round((-diffPitch / 35) * 100 * sensorSensitivity);

        steerVal = Math.max(-100, Math.min(100, steerVal));
        throttleVal = Math.max(-100, Math.min(100, throttleVal));

        if (sensorMode === 'drive') {
            joystickState.steering = steerVal;
            joystickState.throttle = throttleVal;
            const elSteer = document.getElementById('telemetry-steering');
            if (elSteer) elSteer.innerText = `X: ${steerVal}%`;
            const elThrot = document.getElementById('telemetry-throttle');
            if (elThrot) elThrot.innerText = `Y: ${throttleVal}%`;
        } else if (sensorMode === 'steering_only') {
            joystickState.steering = steerVal;
            const elSteer = document.getElementById('telemetry-steering');
            if (elSteer) elSteer.innerText = `X: ${steerVal}%`;
        } else if (sensorMode === 'gimbal') {
            const s1 = Math.max(0, Math.min(180, Math.round(90 + steerVal * 0.9)));
            const s2 = Math.max(0, Math.min(180, Math.round(90 + throttleVal * 0.9)));
            const formatted = ProtocolManager.formatCommand('GIMBAL', { x: s1, y: s2 });
            sendPacket(formatted);
        }
    }

    window.onNativeSensorData = (pitch, roll, yaw, ax, ay, az) => {
        processSensorValues(pitch, roll, yaw, ax, ay, az);
    };

    window.addEventListener('deviceorientation', (e) => {
        if (!window.Android && e.beta !== null && e.gamma !== null) {
            const pitch = e.beta || 0;
            const roll = e.gamma || 0;
            const yaw = e.alpha || 0;
            processSensorValues(pitch, roll, yaw, 0, 0, 0);
        }
    });

    if (sensorsEnabled && window.Android && window.Android.startSensors) {
        window.Android.startSensors(50);
    }

    // ==========================================
    // 6. CÂMERA FPV / STREAMING DE VÍDEO
    // ==========================================
    let cameraActive = false;
    let cameraUrl = 'http://192.168.4.1:81/stream';
    let cameraPreset = 'esp32_cam';
    let cameraDisplayMode = 'pip';
    let cameraHudOpacity = 0.75;
    let cameraFlipH = false;
    let cameraFlipV = false;
    let cameraFacing = 'environment';
    let localMediaStream = null;

    try {
        const savedCam = window.Android && window.Android.loadConfig ?
            window.Android.loadConfig('camera', null) : localStorage.getItem('omnirc_camera');
        if (savedCam) {
            const cc = JSON.parse(savedCam);
            cameraUrl = cc.url || 'http://192.168.4.1:81/stream';
            cameraPreset = cc.preset || 'esp32_cam';
            cameraDisplayMode = cc.mode || 'pip';
            cameraHudOpacity = cc.opacity !== undefined ? cc.opacity : 0.75;
            cameraFlipH = !!cc.flipH;
            cameraFlipV = !!cc.flipV;
            cameraFacing = cc.facing || 'environment';
        }
    } catch (e) {}

    setupModal('btn-open-camera', 'modal-camera', () => {
        const selPreset = document.getElementById('cam-preset');
        if (selPreset) selPreset.value = cameraPreset;
        const txtUrl = document.getElementById('cam-stream-url');
        if (txtUrl) txtUrl.value = cameraUrl;
        const selMode = document.getElementById('cam-display-mode');
        if (selMode) selMode.value = cameraDisplayMode;
        const selOpacity = document.getElementById('cam-hud-opacity');
        if (selOpacity) selOpacity.value = String(cameraHudOpacity);
        const chkFlipH = document.getElementById('cam-flip-h');
        if (chkFlipH) chkFlipH.checked = cameraFlipH;
        const chkFlipV = document.getElementById('cam-flip-v');
        if (chkFlipV) chkFlipV.checked = cameraFlipV;
        const selFacing = document.getElementById('cam-local-facing');
        if (selFacing) selFacing.value = cameraFacing;

        updateCamModalFields();
    });

    const btnFpvQuickConfig = document.getElementById('btn-fpv-config-quick');
    if (btnFpvQuickConfig) {
        btnFpvQuickConfig.addEventListener('click', () => {
            const modal = document.getElementById('modal-camera');
            if (modal) modal.classList.add('active');
        });
    }

    function updateCamModalFields() {
        const preset = document.getElementById('cam-preset').value;
        const grpUrl = document.getElementById('group-cam-url');
        const grpLocal = document.getElementById('group-local-cam-opts');
        if (preset === 'local_cam') {
            if (grpUrl) grpUrl.style.display = 'none';
            if (grpLocal) grpLocal.style.display = 'block';
        } else {
            if (grpUrl) grpUrl.style.display = 'block';
            if (grpLocal) grpLocal.style.display = 'none';
        }
    }

    const camPresetSelect = document.getElementById('cam-preset');
    if (camPresetSelect) {
        camPresetSelect.addEventListener('change', (e) => {
            const preset = e.target.value;
            const inputUrl = document.getElementById('cam-stream-url');
            if (preset === 'esp32_cam') {
                inputUrl.value = 'http://192.168.4.1:81/stream';
            } else if (preset === 'ip_cam') {
                inputUrl.value = 'http://192.168.1.100:8080/videostream.cgi';
            } else if (preset === 'rpi_cam') {
                inputUrl.value = 'http://192.168.1.150:8080/?action=stream';
            } else if (preset === 'custom') {
                inputUrl.value = 'http://';
            }
            updateCamModalFields();
        });
    }

    const btnCamStart = document.getElementById('btn-cam-start');
    if (btnCamStart) {
        btnCamStart.addEventListener('click', () => {
            cameraPreset = document.getElementById('cam-preset').value;
            cameraUrl = document.getElementById('cam-stream-url').value.trim();
            cameraDisplayMode = document.getElementById('cam-display-mode').value;
            cameraHudOpacity = parseFloat(document.getElementById('cam-hud-opacity').value) || 0.75;
            cameraFlipH = document.getElementById('cam-flip-h').checked;
            cameraFlipV = document.getElementById('cam-flip-v').checked;
            cameraFacing = document.getElementById('cam-local-facing').value;

            const cfg = {
                url: cameraUrl,
                preset: cameraPreset,
                mode: cameraDisplayMode,
                opacity: cameraHudOpacity,
                flipH: cameraFlipH,
                flipV: cameraFlipV,
                facing: cameraFacing
            };
            const serialized = JSON.stringify(cfg);
            if (window.Android && window.Android.saveConfig) {
                window.Android.saveConfig('camera', serialized);
            } else {
                localStorage.setItem('omnirc_camera', serialized);
            }

            startCameraStream();
            const modal = document.getElementById('modal-camera');
            if (modal) modal.classList.remove('active');
            triggerHaptic(30);
            playBeep(900, 0.05);
        });
    }

    const btnCamDisconnect = document.getElementById('btn-cam-disconnect');
    if (btnCamDisconnect) {
        btnCamDisconnect.addEventListener('click', () => {
            stopCameraStream();
            const modal = document.getElementById('modal-camera');
            if (modal) modal.classList.remove('active');
            triggerHaptic(20);
        });
    }

    const btnFpvClose = document.getElementById('btn-fpv-close');
    if (btnFpvClose) {
        btnFpvClose.addEventListener('click', () => {
            stopCameraStream();
            triggerHaptic(20);
        });
    }

    const btnFpvMode = document.getElementById('btn-fpv-mode');
    if (btnFpvMode) {
        btnFpvMode.addEventListener('click', () => {
            cameraDisplayMode = cameraDisplayMode === 'pip' ? 'hud' : 'pip';
            applyCameraLayoutMode();
            triggerHaptic(15);
        });
    }

    const btnFpvFlip = document.getElementById('btn-fpv-flip');
    if (btnFpvFlip) {
        btnFpvFlip.addEventListener('click', () => {
            cameraFlipH = !cameraFlipH;
            applyMediaTransform();
            triggerHaptic(15);
        });
    }

    const btnFpvSnapshot = document.getElementById('btn-fpv-snapshot');
    if (btnFpvSnapshot) {
        btnFpvSnapshot.addEventListener('click', () => {
            takeCameraSnapshot();
            triggerHaptic(30);
            playBeep(1200, 0.08);
        });
    }

    function applyMediaTransform() {
        const img = document.getElementById('fpv-stream-img');
        const video = document.getElementById('fpv-stream-video');
        [img, video].forEach(media => {
            if (media) {
                media.classList.toggle('flip-h', cameraFlipH);
                media.classList.toggle('flip-v', cameraFlipV);
            }
        });
    }

    function applyCameraLayoutMode() {
        const container = document.getElementById('fpv-camera-container');
        if (!container) return;

        container.classList.remove('pip-mode', 'hud-mode');
        if (cameraDisplayMode === 'hud') {
            container.classList.add('hud-mode');
            document.body.classList.add('camera-hud-active');
            const btnMode = document.getElementById('btn-fpv-mode');
            if (btnMode) btnMode.innerText = '🔲 PiP';
        } else {
            container.classList.add('pip-mode');
            document.body.classList.remove('camera-hud-active');
            const btnMode = document.getElementById('btn-fpv-mode');
            if (btnMode) btnMode.innerText = '🔲 Fundo';
        }
    }

    function startCameraStream() {
        const container = document.getElementById('fpv-camera-container');
        const img = document.getElementById('fpv-stream-img');
        const video = document.getElementById('fpv-stream-video');
        const placeholder = document.getElementById('fpv-placeholder');
        const badge = document.getElementById('fpv-status-badge');

        if (!container || !img || !video) return;

        stopCameraStream(false);
        container.style.display = 'flex';
        applyCameraLayoutMode();
        applyMediaTransform();

        if (cameraPreset === 'local_cam') {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia({
                    video: { facingMode: cameraFacing },
                    audio: false
                }).then(stream => {
                    localMediaStream = stream;
                    video.srcObject = stream;
                    video.style.display = 'block';
                    img.style.display = 'none';
                    if (placeholder) placeholder.style.display = 'none';
                    if (badge) {
                        badge.innerText = 'AO VIVO';
                        badge.classList.add('live');
                    }
                    cameraActive = true;
                    logTerminal('Câmera Local iniciada com sucesso', 'cmd');
                }).catch(err => {
                    console.error("Camera error", err);
                    logTerminal(`Erro ao acessar câmera local: ${err.message}`, 'err');
                    if (placeholder) placeholder.style.display = 'flex';
                });
            } else {
                logTerminal('API de câmera local não suportada', 'err');
            }
        } else {
            if (cameraUrl) {
                video.style.display = 'none';
                img.style.display = 'block';
                if (placeholder) placeholder.style.display = 'none';
                img.src = cameraUrl;
                if (badge) {
                    badge.innerText = 'AO VIVO';
                    badge.classList.add('live');
                }
                cameraActive = true;
                logTerminal(`Stream de Câmera conectado: ${cameraUrl}`, 'cmd');
            }
        }
    }

    function stopCameraStream(hideContainer = true) {
        const container = document.getElementById('fpv-camera-container');
        const img = document.getElementById('fpv-stream-img');
        const video = document.getElementById('fpv-stream-video');
        const placeholder = document.getElementById('fpv-placeholder');
        const badge = document.getElementById('fpv-status-badge');

        if (localMediaStream) {
            localMediaStream.getTracks().forEach(track => track.stop());
            localMediaStream = null;
        }

        if (video) {
            video.srcObject = null;
            video.style.display = 'none';
        }

        if (img) {
            img.src = '';
            img.style.display = 'none';
        }

        if (placeholder) placeholder.style.display = 'flex';
        if (badge) {
            badge.innerText = 'OFF';
            badge.classList.remove('live');
        }

        cameraActive = false;
        document.body.classList.remove('camera-hud-active');

        if (hideContainer && container) {
            container.style.display = 'none';
        }
    }

    function takeCameraSnapshot() {
        const img = document.getElementById('fpv-stream-img');
        const video = document.getElementById('fpv-stream-video');
        const canvas = document.createElement('canvas');

        if (video && video.style.display !== 'none' && video.videoWidth > 0) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (cameraFlipH) {
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
            }
            ctx.drawImage(video, 0, 0);
            saveCanvasImage(canvas);
        } else if (img && img.style.display !== 'none') {
            try {
                canvas.width = img.naturalWidth || 640;
                canvas.height = img.naturalHeight || 480;
                const ctx = canvas.getContext('2d');
                if (cameraFlipH) {
                    ctx.translate(canvas.width, 0);
                    ctx.scale(-1, 1);
                }
                ctx.drawImage(img, 0, 0);
                saveCanvasImage(canvas);
            } catch (e) {
                logTerminal('Captura salva na visualização', 'cmd');
            }
        }
    }

    function saveCanvasImage(canvas) {
        try {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `OmniRC_Capture_${Date.now()}.jpg`;
            a.click();
            logTerminal('Foto capturada e salva com sucesso!', 'cmd');
        } catch (e) {
            logTerminal('Foto processada no visualizador', 'cmd');
        }
    }

    // Zero sensor state on emergency stop
    const origEmergencyHandler = btnEmergency ? btnEmergency.onclick : null;
    if (btnEmergency) {
        btnEmergency.addEventListener('click', () => {
            sensorCalibration.pitch = currentSensorValues.pitch;
            sensorCalibration.roll = currentSensorValues.roll;
        });
    }

});
