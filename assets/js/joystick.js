/**
 * OmniRC Virtual Analog Joystick
 * Multi-touch responsive joystick controller with spring return and customizable axes
 */
class VirtualJoystick {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.options = Object.assign({
            axis: 'BOTH', // 'BOTH', 'X_ONLY', 'Y_ONLY'
            autoReturn: true, // snaps back to center on release
            maxDistance: 65,
            onChange: (x, y) => {},
            onRelease: () => {},
            color: '#00E5FF'
        }, options);

        this.touchId = null;
        this.isActive = false;
        this.currentX = 0; // -100 to 100
        this.currentY = 0; // -100 to 100

        this.initDOM();
        this.bindEvents();
    }

    initDOM() {
        this.container.innerHTML = '';
        this.container.classList.add('joystick-base');

        this.stick = document.createElement('div');
        this.stick.classList.add('joystick-knob');
        this.stick.style.borderColor = this.options.color;

        this.centerDot = document.createElement('div');
        this.centerDot.classList.add('joystick-center-dot');
        this.centerDot.style.backgroundColor = this.options.color;

        this.container.appendChild(this.centerDot);
        this.container.appendChild(this.stick);
    }

    bindEvents() {
        const onStart = (e) => {
            const touch = e.changedTouches ? e.changedTouches[0] : e;
            if (this.touchId !== null && e.changedTouches) return;

            if (e.changedTouches) {
                this.touchId = touch.identifier;
            } else {
                this.touchId = 'mouse';
            }

            this.isActive = true;
            this.container.classList.add('active');
            this.updatePosition(touch.clientX, touch.clientY);
            e.preventDefault();
        };

        const onMove = (e) => {
            if (!this.isActive) return;
            let touch = null;
            if (e.changedTouches) {
                for (let i = 0; i < e.changedTouches.length; i++) {
                    if (e.changedTouches[i].identifier === this.touchId) {
                        touch = e.changedTouches[i];
                        break;
                    }
                }
            } else if (this.touchId === 'mouse') {
                touch = e;
            }

            if (touch) {
                this.updatePosition(touch.clientX, touch.clientY);
                e.preventDefault();
            }
        };

        const onEnd = (e) => {
            if (!this.isActive) return;
            let ended = false;
            if (e.changedTouches) {
                for (let i = 0; i < e.changedTouches.length; i++) {
                    if (e.changedTouches[i].identifier === this.touchId) {
                        ended = true;
                        break;
                    }
                }
            } else if (this.touchId === 'mouse') {
                ended = true;
            }

            if (ended) {
                this.touchId = null;
                this.isActive = false;
                this.container.classList.remove('active');

                if (this.options.autoReturn) {
                    this.resetPosition();
                }
                this.options.onRelease();
                e.preventDefault();
            }
        };

        this.container.addEventListener('touchstart', onStart, { passive: false });
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onEnd, { passive: false });
        window.addEventListener('touchcancel', onEnd, { passive: false });

        this.container.addEventListener('mousedown', onStart);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);
    }

    updatePosition(clientX, clientY) {
        const rect = this.container.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let deltaX = clientX - centerX;
        let deltaY = clientY - centerY;

        if (this.options.axis === 'X_ONLY') deltaY = 0;
        if (this.options.axis === 'Y_ONLY') deltaX = 0;

        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const maxDist = this.options.maxDistance;

        if (distance > maxDist) {
            const angle = Math.atan2(deltaY, deltaX);
            deltaX = Math.cos(angle) * maxDist;
            deltaY = Math.sin(angle) * maxDist;
        }

        this.stick.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

        // Invert Y so up is positive (+100) and down is negative (-100)
        this.currentX = Math.round((deltaX / maxDist) * 100);
        this.currentY = Math.round((-deltaY / maxDist) * 100);

        this.options.onChange(this.currentX, this.currentY);
    }

    resetPosition() {
        this.currentX = 0;
        this.currentY = 0;
        this.stick.style.transform = 'translate(0px, 0px)';
        this.options.onChange(0, 0);
    }

    setValues(x, y) {
        this.currentX = x;
        this.currentY = y;
        const deltaX = (x / 100) * this.options.maxDistance;
        const deltaY = (-y / 100) * this.options.maxDistance;
        this.stick.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        this.options.onChange(x, y);
    }
}
