// ============================================================
// WB Drive · Прототип кнопки «Завершить поездку» (Склад → ПВЗ)
// Версия после дизайн-ревью: постоянная кнопка «!» слева от
// Навигатора + единый упрощённый bottom sheet «У вас что-то
// случилось?» (инфо + поддержка + slide-to-confirm + отмена).
// ============================================================

(function () {
    'use strict';

    // — Реалистичные точки маршрута. Суммы коробок подобраны под состояния. —
    const POINTS = [
        { n: 1, address: 'Дворцовая пл., 2А',     district: 'Санкт-Петербург', boxes: 5, distance: '10 км', eta: '~15 минут' },
        { n: 2, address: 'Невский пр., 88',       district: 'Санкт-Петербург', boxes: 7, distance: '4 км',  eta: '~12 минут' },
        { n: 3, address: 'Литейный пр., 12',      district: 'Санкт-Петербург', boxes: 6, distance: '3 км',  eta: '~10 минут' },
        { n: 4, address: 'Цветной бульвар, 5',    district: 'Санкт-Петербург', boxes: 8, distance: '5 км',  eta: '~14 минут' },
        { n: 5, address: 'Лиговский пр., 50',     district: 'Санкт-Петербург', boxes: 4, distance: '2 км',  eta: '~8 минут'  },
        { n: 6, address: 'Садовая ул., 18',       district: 'Санкт-Петербург', boxes: 5, distance: '3 км',  eta: '~10 минут' },
        { n: 7, address: 'Гороховая ул., 30',     district: 'Санкт-Петербург', boxes: 7, distance: '4 км',  eta: '~12 минут' },
        { n: 8, address: 'Пушкинская ул., 10',    district: 'Санкт-Петербург', boxes: 2, distance: '1 км',  eta: '~5 минут'  },
    ];
    const TOTAL_BOXES = POINTS.reduce((s, p) => s + p.boxes, 0); // = 44

    // — Возвратные коробки. На реальном маршруте водитель забирает их с ПВЗ. —
    const RETURNS_COUNT = 55;
    const WAREHOUSE_ADDRESS = 'г. Подольск, д. Коледино,\nул. Троицкая, 20';

    // — Демо-состояния (определяют, сколько точек считаются "разгруженными") —
    const SCENARIOS = [
        { label: '0/44',  donePoints: 0, currentIdx: 0 },
        { label: '12/44', donePoints: 2, currentIdx: 2 },
        { label: '42/44', donePoints: 7, currentIdx: 7 },
        { label: '44/44', donePoints: 8, currentIdx: null },
    ];

    const state = {
        scenarioIdx: 0,
        hasReturns: false,   // флаг: в поездку входят возвраты на склад
        atWarehouse: false,  // флаг: водитель прибыл на склад и сдал возвраты
        activeTab: 'pvz',    // 'pvz' | 'map' | 'returns'
        sheet: null,         // null | 'incident'
        success: null,       // null | 'completed' | 'completed-with-returns' | 'early-finish'
        allPointsOpen: false,
    };

    const screen = document.getElementById('screen');

    // ============================================================
    // SVG helper
    // ============================================================
    function svg(id, size = 24) {
        return `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#${id}"/></svg>`;
    }

    // ============================================================
    // Helpers: производные значения для текущего сценария
    // ============================================================
    function getScenario() {
        return SCENARIOS[state.scenarioIdx];
    }
    function getDoneBoxes() {
        const sc = getScenario();
        return POINTS.slice(0, sc.donePoints).reduce((s, p) => s + p.boxes, 0);
    }
    function getDonePoints() {
        return getScenario().donePoints;
    }
    function getCurrentPoint() {
        const sc = getScenario();
        if (sc.currentIdx === null) return null;
        return POINTS[sc.currentIdx];
    }
    function getUnloadedPoints() {
        const sc = getScenario();
        return POINTS.slice(sc.donePoints);
    }
    function getUnloadedBoxes() {
        return TOTAL_BOXES - getDoneBoxes();
    }
    function isComplete() {
        return getDonePoints() === POINTS.length;
    }

    // ============================================================
    // Render: главный экран маршрута
    // ============================================================
    function renderMain() {
        const sc = getScenario();
        const done = getDoneBoxes();
        const complete = isComplete();
        const current = getCurrentPoint();

        const html = `
            <div class="page">
                <!-- Шапка маршрута -->
                <header class="fr-topbar">
                    <div class="fr-topbar__title">Разгрузка №256352</div>
                    <div class="fr-topbar__subtitle">Маршрут 2453 · 0 ₽</div>
                    <div class="fr-topbar__actions">
                        <button class="fr-topbar__action" aria-label="Поиск">${svg('i-search', 22)}</button>
                        <button class="fr-topbar__action" aria-label="Обновить">${svg('i-refresh', 22)}</button>
                    </div>
                </header>

                <!-- Сегмент-табы (кликабельные) -->
                <div class="fr-segments">
                    <button class="fr-segment ${state.activeTab === 'pvz' ? 'is-active' : ''}" data-tab="pvz">Список ПВЗ</button>
                    <button class="fr-segment ${state.activeTab === 'map' ? 'is-active' : ''}" data-tab="map">Карта</button>
                    <button class="fr-segment ${state.activeTab === 'returns' ? 'is-active' : ''}" data-tab="returns">Возвраты${state.hasReturns ? ` <span class="fr-segment__badge">${RETURNS_COUNT}</span>` : ''}</button>
                </div>

                <div class="page__scroll">
                    ${renderActiveTabContent(current, complete, done, sc)}
                </div>

                <!-- Нижняя плашка с действиями -->
                <div class="fr-bottom-actions">
                    ${renderBottomActions()}
                </div>

                <!-- Тапбар -->
                <nav class="fr-tabbar">
                    <button class="fr-tabbar__item is-active" aria-label="Работа">${svg('i-briefcase', 24)}</button>
                    <button class="fr-tabbar__item" aria-label="Кошелёк">${svg('i-wallet', 24)}</button>
                    <button class="fr-tabbar__item" aria-label="Чат">${svg('i-chat', 24)}</button>
                    <button class="fr-tabbar__item" aria-label="Профиль">${svg('i-profile-tab', 24)}</button>
                </nav>

                <!-- Bottom sheet & backdrop -->
                <div class="fr-backdrop" id="backdrop"></div>
                <div class="fr-sheet" id="sheet" role="dialog" aria-modal="true">
                    <div class="fr-sheet__handle"></div>
                    <div id="sheetContent"></div>
                </div>

                <!-- Success-экран -->
                <div class="fr-success" id="success"></div>
            </div>
        `;

        screen.innerHTML = html;
        wireEvents();
    }

    function renderCurrentPoint(p) {
        return `
            <div class="fr-point is-current">
                <div class="fr-point__head">
                    <div class="fr-point__title">Точка ${p.n}</div>
                    <button class="fr-point__info-btn" aria-label="Информация">${svg('i-info', 24)}</button>
                </div>
                <div class="fr-point__row">
                    ${svg('i-shop', 22)}
                    <span class="fr-point__row-main">г. ${p.district},<br>${p.address}</span>
                </div>
                <div class="fr-point__row">
                    ${svg('i-box', 22)}
                    <span class="fr-point__row-main">Коробки 0/${p.boxes} шт</span>
                </div>
                <div class="fr-point__row">
                    ${svg('i-route', 22)}
                    <div>
                        <div class="fr-point__row-main">${p.distance}</div>
                        <div class="fr-point__row-sub">До следующей точки</div>
                    </div>
                </div>
                <div class="fr-point__row">
                    ${svg('i-clock', 22)}
                    <div>
                        <div class="fr-point__row-main">${p.eta}</div>
                        <div class="fr-point__row-sub">Время в пути</div>
                    </div>
                </div>
                <button class="fr-point__action">Разгрузить</button>
            </div>
        `;
    }

    // ============================================================
    // Контент таба (Список ПВЗ / Карта / Возвраты)
    // ============================================================
    function renderActiveTabContent(current, complete, done, sc) {
        if (state.activeTab === 'pvz')     return renderPvzTab(current, complete, done, sc);
        if (state.activeTab === 'map')     return renderMapTab();
        if (state.activeTab === 'returns') return renderReturnsTab();
        return '';
    }

    function renderPvzTab(current, complete, done, sc) {
        return `
            <!-- Прогресс выгрузки + ТТН -->
            <div class="fr-progress-row">
                <div class="fr-progress ${complete ? 'is-complete' : ''}">
                    <div class="fr-progress__header">
                        <div class="fr-progress__icon">${svg('i-box', 22)}</div>
                        <div class="fr-progress__numbers">
                            <div class="fr-progress__count">${done} / ${TOTAL_BOXES}</div>
                            <div class="fr-progress__label">Выгружено / Всего</div>
                        </div>
                    </div>
                    <div class="fr-progress__bar">
                        <div class="fr-progress__fill" style="width: ${(done / TOTAL_BOXES) * 100}%"></div>
                    </div>
                </div>
                <div class="fr-ttn">
                    <div class="fr-ttn__title">ТТН</div>
                    <div class="fr-ttn__row">
                        <span class="fr-ttn__caption">PDF</span>
                        <span class="fr-ttn__download">${svg('i-arrow-down', 18)}</span>
                    </div>
                </div>
            </div>

            ${renderMainCard(current)}

            <!-- Все точки разгрузки -->
            <div class="fr-all-points ${state.allPointsOpen ? 'is-open' : ''}" id="allPointsToggle">
                <span class="fr-all-points__icon">${svg('i-route', 24)}</span>
                <span>Все точки разгрузки</span>
                <span class="fr-all-points__count">${getDonePoints()} из ${POINTS.length}</span>
                <span class="fr-all-points__chevron">${svg('i-chevron-down', 20)}</span>
            </div>
            <div class="fr-all-points-list ${state.allPointsOpen ? 'is-open' : ''}" id="allPointsList">
                ${POINTS.map((p, i) => {
                    const isDone = i < sc.donePoints;
                    return `
                        <div class="fr-all-points-list__item ${isDone ? 'is-done' : ''}">
                            <div class="fr-all-points-list__num">${isDone ? svg('i-check', 16) : p.n}</div>
                            <div class="fr-all-points-list__main">
                                <div class="fr-all-points-list__addr">${p.address}</div>
                                <div class="fr-all-points-list__sub">${p.boxes} коробок · ${p.distance}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderMapTab() {
        return `
            <div class="fr-empty-tab">
                ${svg('i-route', 48)}
                <div class="fr-empty-tab__title">Карта</div>
                <div class="fr-empty-tab__sub">Здесь — карта с точками маршрута. В прототипе опущено, чтобы сфокусироваться на кнопке завершения.</div>
            </div>
        `;
    }

    function renderReturnsTab() {
        if (!state.hasReturns) {
            return `
                <div class="fr-empty-tab">
                    ${svg('i-box', 48)}
                    <div class="fr-empty-tab__title">Возвратов нет</div>
                    <div class="fr-empty-tab__sub">В этой поездке нет возвратов на склад. Когда разгрузите все ПВЗ, можно завершить поездку.</div>
                </div>
            `;
        }
        const delivered = state.atWarehouse ? RETURNS_COUNT : 0;
        const isReturnsDone = delivered === RETURNS_COUNT;
        return `
            <div class="fr-returns-progress">
                <div class="fr-progress ${isReturnsDone ? 'is-complete' : ''}" style="width:100%;">
                    <div class="fr-progress__header">
                        <div class="fr-progress__icon">${svg('i-box', 22)}</div>
                        <div class="fr-progress__numbers">
                            <div class="fr-progress__count">${delivered} / ${RETURNS_COUNT}</div>
                            <div class="fr-progress__label">Сдано на склад / Всего возвратов</div>
                        </div>
                    </div>
                    <div class="fr-progress__bar">
                        <div class="fr-progress__fill" style="width: ${(delivered / RETURNS_COUNT) * 100}%"></div>
                    </div>
                </div>
            </div>

            <div class="fr-point ${isReturnsDone ? 'is-completed' : 'is-current'}">
                <div class="fr-point__head">
                    <div class="fr-point__title">Возвраты на склад</div>
                    ${isReturnsDone ? `<span class="fr-point__status">${svg('i-check', 14)} Сдано</span>` : ''}
                </div>
                <div class="fr-point__row">
                    <span class="fr-warehouse-icon">${svg('i-warehouse', 22)}</span>
                    <span class="fr-point__row-main" style="white-space: pre-line;">${WAREHOUSE_ADDRESS}</span>
                </div>
                <div class="fr-point__row">
                    ${svg('i-box', 22)}
                    <span class="fr-point__row-main">Коробки ${delivered}/${RETURNS_COUNT} шт</span>
                </div>
                ${isReturnsDone ? '' : `
                    <button class="fr-point__action ${state.atWarehouse ? '' : 'fr-point__action--ghost'}" id="deliverReturnsBtn">
                        ${state.atWarehouse ? 'Сдать возвраты' : 'Разгрузить'}
                    </button>
                `}
            </div>
        `;
    }

    function renderMainCard(current) {
        // Если есть текущая точка — показываем её (приоритетно)
        if (current) return renderCurrentPoint(current);

        // Все точки разгружены. Дальше — три варианта в зависимости от возвратов и склада.
        const hasReturns = state.hasReturns;
        const atWarehouse = state.atWarehouse;

        if (!hasReturns) {
            return renderAllDoneCard();
        }
        if (hasReturns && !atWarehouse) {
            return renderReturnsToDeliverCard();
        }
        if (hasReturns && atWarehouse) {
            return renderAtWarehouseCard();
        }
    }

    function renderAllDoneCard() {
        return `
            <div class="fr-point">
                <div class="fr-point__head">
                    <div class="fr-point__title" style="color: var(--fr-success-fg)">Все точки разгружены</div>
                    <span class="fr-point__status">${svg('i-check', 14)} Готово</span>
                </div>
                <div class="fr-point__row">
                    ${svg('i-box', 22)}
                    <span class="fr-point__row-main">${TOTAL_BOXES} коробок передано в ПВЗ</span>
                </div>
                <div class="fr-point__row">
                    ${svg('i-clock', 22)}
                    <div>
                        <div class="fr-point__row-main">Поездку можно завершить</div>
                        <div class="fr-point__row-sub">Все 8 точек обработаны</div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderReturnsToDeliverCard() {
        return `
            <div class="fr-point" style="border: 1px solid rgba(176, 121, 0, 0.18); background: #fff8e6;">
                <div class="fr-point__head">
                    <div class="fr-point__title" style="color: #6b4d00">Везите возвраты на склад</div>
                    <span class="fr-point__status" style="background: #fff4d6; color: #b07900;">${svg('i-warning', 14)} ${RETURNS_COUNT} коробок</span>
                </div>
                <div class="fr-point__row">
                    ${svg('i-box', 22)}
                    <span class="fr-point__row-main">${TOTAL_BOXES} коробок переданы в ПВЗ. У вас в кузове ${RETURNS_COUNT} возвратных.</span>
                </div>
                <div class="fr-point__row">
                    ${svg('i-route', 22)}
                    <div>
                        <div class="fr-point__row-main">Доставьте на склад</div>
                        <div class="fr-point__row-sub">Поездка завершится после сдачи возвратов</div>
                    </div>
                </div>
                <button class="fr-point__action" id="markAtWarehouseBtn">
                    Я приехал на склад
                </button>
            </div>
        `;
    }

    function renderAtWarehouseCard() {
        return `
            <div class="fr-point" style="border: 1px solid rgba(167, 58, 253, 0.20); background: #faf3ff;">
                <div class="fr-point__head">
                    <div class="fr-point__title" style="color: var(--mo-accent-purple)">Вы на складе</div>
                    <span class="fr-point__status" style="background: var(--mo-accent-purple-soft); color: var(--mo-accent-purple);">${svg('i-check', 14)} Прибыли</span>
                </div>
                <div class="fr-point__row">
                    ${svg('i-box', 22)}
                    <span class="fr-point__row-main">Сдайте ${RETURNS_COUNT} возвратных ${pluralize(RETURNS_COUNT,'коробку','коробки','коробок')} приёмщику.</span>
                </div>
                <div class="fr-point__row">
                    ${svg('i-info', 22)}
                    <div>
                        <div class="fr-point__row-main">После сдачи — завершите поездку</div>
                        <div class="fr-point__row-sub">Кнопка ниже стала активна</div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderBottomActions() {
        const allDelivered = isComplete();
        const hasReturns = state.hasReturns;
        const atWarehouse = state.atWarehouse;

        // Постоянная красная кнопка «!» — досрочное/аварийное завершение.
        // Открывает единый bottom sheet «У вас что-то случилось?».
        const incidentBtn = `
            <button class="fr-incident-btn" id="incidentBtn" aria-label="У вас что-то случилось?">
                ${svg('i-warning', 24)}
            </button>
        `;

        // ─── Кейс A: всё разгружено + возвратов нет → нормальное завершение в один тап ───
        if (allDelivered && !hasReturns) {
            return `
                <div class="fr-bottom-row">
                    <button class="fr-navigator fr-navigator--icon" aria-label="Навигатор">
                        ${svg('i-navigator', 22)}<span>Навигатор</span>
                    </button>
                    <button class="fr-finish-primary" id="finishBtn">
                        ${svg('i-check', 22)} Завершить поездку
                    </button>
                </div>
            `;
        }

        // ─── Кейс B: всё разгружено + есть возвраты + на складе → нормальное завершение ───
        if (allDelivered && hasReturns && atWarehouse) {
            return `
                <div class="fr-bottom-row">
                    <button class="fr-navigator fr-navigator--icon" aria-label="Навигатор">
                        ${svg('i-navigator', 22)}<span>Навигатор</span>
                    </button>
                    <button class="fr-finish-primary" id="finishBtn">
                        ${svg('i-check', 22)} Сдать возвраты и завершить
                    </button>
                </div>
            `;
        }

        // ─── Кейс C: всё разгружено + есть возвраты + НЕ на складе → «!» + Навигатор «Склад» ───
        if (allDelivered && hasReturns && !atWarehouse) {
            return `
                <div class="fr-bottom-row">
                    ${incidentBtn}
                    <button class="fr-navigator" aria-label="Навигатор">
                        ${svg('i-navigator', 22)}<span>Навигатор «Склад»</span>
                    </button>
                </div>
            `;
        }

        // ─── Кейс D: поездка ещё идёт → постоянная «!» + большой Навигатор ───
        return `
            <div class="fr-bottom-row">
                ${incidentBtn}
                <button class="fr-navigator" aria-label="Навигатор">
                    ${svg('i-navigator', 22)}<span>Навигатор</span>
                </button>
            </div>
        `;
    }

    // ============================================================
    // Bottom sheet: «У вас что-то случилось?» (единый, после ревью)
    // Инфо о коробках + «Написать в поддержку» + slide-to-confirm.
    // ============================================================
    function renderSheetIncident() {
        const atDriver = getUnloadedBoxes() + (state.hasReturns ? RETURNS_COUNT : 0);

        return `
            <div class="fr-sheet__close-row">
                <button class="fr-sheet__close" id="sheetClose" aria-label="Закрыть">${svg('i-close', 20)}</button>
            </div>
            <div class="fr-sheet__body fr-incident">
                <div class="fr-incident__icon">${svg('i-warning', 32)}</div>
                <div class="fr-incident__title">У вас что-то случилось?</div>
                <div class="fr-incident__sub">
                    Если не можете продолжать поездку — завершите её здесь.
                    Мы отправим уведомление экспедитору, он подскажет, что делать дальше.
                </div>

                <div class="fr-incident__callout">
                    <div class="fr-incident__callout-icon">${svg('i-warning', 22)}</div>
                    <div class="fr-incident__callout-text">
                        <b>Коробки числятся за вами${atDriver > 0 ? ` — ${atDriver} ${pluralize(atDriver, 'шт', 'шт', 'шт')}` : ''}</b><br>
                        Экспедитор организует возврат на склад через другого водителя.
                    </div>
                </div>

                <button class="fr-support-btn" id="supportBtn">
                    ${svg('i-chat', 22)} Написать в поддержку
                </button>

                ${renderSlideToConfirm('Завершить поездку')}

                <button class="fr-cancel-link" id="sheetClose2">Отмена</button>
            </div>
        `;
    }

    function renderSlideToConfirm(label, hint = 'Проведите слева направо') {
        return `
            <div class="fr-slide fr-slide--destructive" id="slide" data-label="${label}">
                <div class="fr-slide__fill" id="slideFill"></div>
                <div class="fr-slide__track-text" id="slideText">
                    <span class="fr-slide__label">${label}</span>
                    <span class="fr-slide__hint">${hint}</span>
                </div>
                <div class="fr-slide__handle" id="slideHandle">${svg('i-arrow-right', 24)}</div>
            </div>
        `;
    }

    function pluralize(n, one, few, many) {
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return one;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
        return many;
    }

    // ============================================================
    // Success-экран
    // ============================================================
    function renderSuccess(kind) {
        // Сборка корректных текстов с учётом возвратов
        const atDriver = getUnloadedBoxes() + (state.hasReturns ? RETURNS_COUNT : 0);

        const map = {
            'completed': {
                icon: svg('i-check', 48),
                iconClass: '',
                title: 'Поездка завершена',
                sub: `Все ${TOTAL_BOXES} коробок успешно переданы в ПВЗ. Спасибо за смену!`,
            },
            'completed-with-returns': {
                icon: svg('i-check', 48),
                iconClass: '',
                title: 'Поездка завершена',
                sub: `Все ${TOTAL_BOXES} коробок переданы в ПВЗ. ${RETURNS_COUNT} ${pluralize(RETURNS_COUNT,'возвратная коробка сдана','возвратные коробки сданы','возвратных коробок сданы')} на склад. Спасибо за смену!`,
            },
            'early-finish': {
                icon: svg('i-warning', 48),
                iconClass: 'is-warning',
                title: 'Поездка завершена досрочно',
                sub: `Уведомление отправлено экспедитору. ${atDriver} ${pluralize(atDriver,'коробка числится','коробки числятся','коробок числятся')} за вами — экспедитор организует их возврат на склад через другого водителя.`,
            },
        };
        const data = map[kind];
        const success = document.getElementById('success');
        success.innerHTML = `
            <div class="fr-success__icon ${data.iconClass}">${data.icon}</div>
            <div class="fr-success__title">${data.title}</div>
            <div class="fr-success__sub">${data.sub}</div>
            <button class="fr-success__btn" id="successClose">Понятно</button>
        `;
        success.classList.add('is-open');
        document.getElementById('successClose').addEventListener('click', () => {
            success.classList.remove('is-open');
            state.success = null;
        });
    }

    // ============================================================
    // Sheet management
    // ============================================================
    function openSheet(kind) {
        state.sheet = kind;
        const sheetContent = document.getElementById('sheetContent');
        if (kind === 'incident') sheetContent.innerHTML = renderSheetIncident();

        document.getElementById('backdrop').classList.add('is-open');
        document.getElementById('sheet').classList.add('is-open');

        wireSheetEvents();
    }

    function closeSheet() {
        state.sheet = null;
        document.getElementById('backdrop').classList.remove('is-open');
        document.getElementById('sheet').classList.remove('is-open');
    }

    // ============================================================
    // Slide-to-confirm — реальный drag-жест (pointer events)
    // ============================================================
    function wireSlide(onConfirm) {
        const slide = document.getElementById('slide');
        const handle = document.getElementById('slideHandle');
        const fill = document.getElementById('slideFill');
        if (!slide || !handle) return;

        let startX = 0;
        let currentX = 0;
        let dragging = false;
        let maxX = 0;
        const HANDLE_W = 48;
        const PADDING = 6;

        function getMaxX() {
            return slide.clientWidth - HANDLE_W - PADDING * 2;
        }

        function onDown(e) {
            dragging = true;
            maxX = getMaxX();
            const point = e.touches ? e.touches[0] : e;
            startX = point.clientX - currentX;
            handle.style.transition = 'none';
            fill.style.transition = 'none';
            e.preventDefault();
        }
        function onMove(e) {
            if (!dragging) return;
            const point = e.touches ? e.touches[0] : e;
            let x = point.clientX - startX;
            x = Math.max(0, Math.min(x, maxX));
            currentX = x;
            handle.style.transform = `translateX(${x}px)`;
            const fillW = HANDLE_W + x + PADDING * 2;
            fill.style.width = fillW + 'px';

            if (x >= maxX - 4) {
                slide.classList.add('is-armed');
            } else {
                slide.classList.remove('is-armed');
            }
        }
        function onUp() {
            if (!dragging) return;
            dragging = false;
            handle.style.transition = '';
            fill.style.transition = '';

            if (currentX >= maxX - 4) {
                slide.classList.add('is-confirmed');
                setTimeout(() => {
                    onConfirm();
                }, 240);
            } else {
                currentX = 0;
                handle.style.transform = 'translateX(0)';
                fill.style.width = HANDLE_W + PADDING * 2 + 'px';
                slide.classList.remove('is-armed');
            }
        }

        handle.addEventListener('pointerdown', onDown);
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);

        // touch fallback (на старых iOS pointerevents работают, но подстрахуемся)
        handle.addEventListener('touchstart', onDown, { passive: false });
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
    }

    // ============================================================
    // Event wiring
    // ============================================================
    function wireEvents() {
        // Primary «Завершить поездку» / «Сдать возвраты и завершить»
        // (кейсы A и B — поездка реально готова к закрытию) → один тап → success
        const finishBtn = document.getElementById('finishBtn');
        if (finishBtn) {
            finishBtn.addEventListener('click', () => {
                if (state.hasReturns && state.atWarehouse) {
                    renderSuccess('completed-with-returns');
                } else {
                    renderSuccess('completed');
                }
            });
        }

        // Постоянная кнопка «!» (кейсы C и D) → единый инцидент-шит
        const incidentBtn = document.getElementById('incidentBtn');
        if (incidentBtn) {
            incidentBtn.addEventListener('click', () => openSheet('incident'));
        }

        // Открыть/закрыть «Все точки»
        const toggle = document.getElementById('allPointsToggle');
        const list = document.getElementById('allPointsList');
        if (toggle && list) {
            toggle.addEventListener('click', () => {
                state.allPointsOpen = !state.allPointsOpen;
                toggle.classList.toggle('is-open', state.allPointsOpen);
                list.classList.toggle('is-open', state.allPointsOpen);
            });
        }

        // Кнопка «Я приехал на склад» — переводит водителя в стейт atWarehouse
        const arrivedBtn = document.getElementById('markAtWarehouseBtn');
        if (arrivedBtn) {
            arrivedBtn.addEventListener('click', () => {
                state.atWarehouse = true;
                renderStateSwitcher();
                renderMain();
            });
        }

        // Переключение табов «Список ПВЗ» / «Карта» / «Возвраты»
        document.querySelectorAll('[data-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                state.activeTab = btn.getAttribute('data-tab');
                state.allPointsOpen = false;
                renderMain();
            });
        });

        // Кнопка «Разгрузить» / «Сдать возвраты» на табе «Возвраты»
        // В реальном flow это ведёт на QR/сканер — в прототипе просто симулируем что
        // водитель приехал на склад и сдал коробки, и активируется кнопка завершения.
        const deliverReturnsBtn = document.getElementById('deliverReturnsBtn');
        if (deliverReturnsBtn) {
            deliverReturnsBtn.addEventListener('click', () => {
                state.atWarehouse = true;
                renderStateSwitcher();
                renderMain();
            });
        }

        // Backdrop клик = закрыть sheet
        const backdrop = document.getElementById('backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', closeSheet);
        }
    }

    function wireSheetEvents() {
        // Закрытие (×, «Отмена», бэкдроп)
        ['sheetClose', 'sheetClose2'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', closeSheet);
        });

        // «Написать в поддержку» — в реальном приложении открывает чат поддержки
        // (deeplink в существующую систему саппорта). В прототипе — пометка нажатия.
        const supportBtn = document.getElementById('supportBtn');
        if (supportBtn) {
            supportBtn.addEventListener('click', () => {
                supportBtn.innerHTML = `${svg('i-check', 22)} Открываем чат поддержки…`;
                supportBtn.classList.add('is-done');
                supportBtn.disabled = true;
            });
        }

        // Slide-to-confirm → досрочное завершение
        if (state.sheet === 'incident') {
            wireSlide(() => {
                closeSheet();
                renderSuccess('early-finish');
            });
        }
    }

    // ============================================================
    // State switcher (демо-плашка, видна только на десктопе)
    // ============================================================
    function renderStateSwitcher() {
        const container = document.getElementById('stateButtons');
        container.innerHTML = `
            ${SCENARIOS.map((s, i) => `
                <button class="state-switcher__btn ${i === state.scenarioIdx ? 'is-active' : ''}" data-action="scenario" data-idx="${i}">${s.label}</button>
            `).join('')}
            <span class="state-switcher__divider"></span>
            <button class="state-switcher__btn ${state.hasReturns ? 'is-active' : ''}" data-action="toggle-returns">
                Возвраты: ${state.hasReturns ? 'есть' : 'нет'}
            </button>
            <button class="state-switcher__btn ${state.atWarehouse ? 'is-active' : ''}" data-action="toggle-warehouse" ${!state.hasReturns ? 'disabled' : ''}>
                На складе: ${state.atWarehouse ? 'да' : 'нет'}
            </button>
        `;
        container.querySelectorAll('.state-switcher__btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-action');
                if (action === 'scenario') {
                    state.scenarioIdx = parseInt(btn.getAttribute('data-idx'), 10);
                } else if (action === 'toggle-returns') {
                    state.hasReturns = !state.hasReturns;
                    if (!state.hasReturns) state.atWarehouse = false;
                } else if (action === 'toggle-warehouse') {
                    state.atWarehouse = !state.atWarehouse;
                }
                state.allPointsOpen = false;
                state.sheet = null;
                state.success = null;
                renderStateSwitcher();
                renderMain();
            });
        });
    }

    // ============================================================
    // Init
    // ============================================================
    renderStateSwitcher();
    renderMain();
})();
