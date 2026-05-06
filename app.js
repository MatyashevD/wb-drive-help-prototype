/* ============================================================
   WB Drive · Help (prototype) — приложение
   - Hash-роутер: #/, #/help, #/help/category/:id, #/help/article/:id
   - Поиск работает клиентский (по title + tags + excerpt)
   - Имитирует переход профиль → нативный экран помощи → WebView
   ============================================================ */

(function () {
    'use strict';

    const screen = document.getElementById('screen');
    const data = window.HELP_DATA;

    // ───────────────────────────────────────────────────────────
    // Утилиты
    // ───────────────────────────────────────────────────────────

    /** Безопасный escape — на случай чужого контента. */
    function esc(str) {
        if (str == null) return '';
        return String(str)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    /** Подсветить вхождения query в text (без ломки HTML — text сначала экранируется). */
    function highlight(text, query) {
        const safe = esc(text);
        if (!query) return safe;
        const q = query.trim();
        if (!q) return safe;
        const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
        return safe.replace(re, '<mark class="match">$1</mark>');
    }

    /** Простое нечёткое совпадение по нескольким полям. */
    function searchArticles(query) {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return data.articles
            .map((a) => {
                const haystacks = [
                    { text: a.title.toLowerCase(), weight: 10 },
                    { text: (a.excerpt || '').toLowerCase(), weight: 3 },
                    { text: (a.tags || []).join(' ').toLowerCase(), weight: 5 },
                    { text: getCategory(a.categoryId).title.toLowerCase(), weight: 2 },
                ];
                let score = 0;
                for (const h of haystacks) {
                    if (h.text.includes(q)) score += h.weight;
                }
                return { article: a, score };
            })
            .filter((r) => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .map((r) => r.article);
    }

    function getCategory(id) {
        return data.categories.find((c) => c.id === id);
    }
    function getArticle(id) {
        return data.articles.find((a) => a.id === id);
    }

    function categoryArticles(categoryId) {
        return data.articles
            .filter((a) => a.categoryId === categoryId)
            .sort((a, b) => b.popularity - a.popularity);
    }

    function popularArticles(limit = 5) {
        return [...data.articles].sort((a, b) => b.popularity - a.popularity).slice(0, limit);
    }

    function svgUse(id, size = 24) {
        // Размер прописываем прямо в HTML-атрибутах: даже если CSS не успел
        // загрузиться/закеширован — иконка всё равно отрисуется правильно.
        // Кастомные размеры через CSS-селекторы (.featured__icon svg и т.д.)
        // имеют высшую специфичность и переопределят это значение.
        return `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#${id}"></use></svg>`;
    }

    // ───────────────────────────────────────────────────────────
    // Общие фрагменты разметки
    // ───────────────────────────────────────────────────────────

    function statusbar() {
        return `
            <div class="statusbar">
                <span class="statusbar__time">12:30</span>
                <span class="statusbar__icons" aria-hidden="true">
                    <svg width="16" height="12" viewBox="0 0 16 12"><path d="M2 8h2v4H2zm4-2h2v6H6zm4-2h2v8h-2zm4-2h2v10h-2z" fill="currentColor"/></svg>
                    <svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 3l-3 4h6L8 3zm-3 5h6v3H5z" fill="currentColor"/></svg>
                    <svg width="22" height="12" viewBox="0 0 22 12"><rect x="0.5" y="1" width="18" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1"/><rect x="2" y="2.5" width="14" height="7" rx="1" fill="currentColor"/><rect x="19" y="4" width="2" height="4" rx="0.5" fill="currentColor"/></svg>
                </span>
            </div>
        `;
    }

    function navbar({ title, back = true, share = false, flat = false } = {}) {
        return `
            <div class="navbar ${flat ? 'navbar--flat' : ''}">
                ${
                    back
                        ? `<button class="navbar__btn" data-back aria-label="Назад">${svgUse('i-chevron-left')}</button>`
                        : `<span class="navbar__btn" aria-hidden="true"></span>`
                }
                <h1 class="navbar__title">${esc(title)}</h1>
                ${
                    share
                        ? `<button class="navbar__btn" aria-label="Поделиться">${svgUse('i-share')}</button>`
                        : `<span class="navbar__btn" aria-hidden="true"></span>`
                }
            </div>
        `;
    }

    function tabbar(activeTab = 'profile') {
        const tab = (id, icon) =>
            `<button class="tabbar__tab ${activeTab === id ? 'is-active' : ''}" data-tab="${id}">
                ${svgUse(icon)}
            </button>`;
        return `
            <div class="tabbar">
                <div class="tabbar__row">
                    ${tab('orders', 'i-briefcase')}
                    ${tab('finance', 'i-wallet')}
                    ${tab('chat', 'i-chat')}
                    ${tab('profile', 'i-profile-tab')}
                </div>
                <div class="tabbar__home"></div>
            </div>
        `;
    }

    function listItem({ icon, title, desc, href, query }) {
        return `
            <a class="list-item" ${href ? `href="${href}"` : ''}>
                ${icon ? `<div class="list-item__icon">${svgUse(icon)}</div>` : ''}
                <div class="list-item__body">
                    <p class="list-item__title">${highlight(title, query)}</p>
                    ${desc ? `<p class="list-item__desc">${highlight(desc, query)}</p>` : ''}
                </div>
                <div class="list-item__chevron">${svgUse('i-chevron-right')}</div>
            </a>
        `;
    }

    // ───────────────────────────────────────────────────────────
    // Экраны
    // ───────────────────────────────────────────────────────────

    /** Профиль — точка входа из реального приложения. */
    function renderProfile() {
        const item = (icon, title, desc, href) =>
            `<a class="list-item" ${href ? `href="${href}"` : ''}>
                <div class="list-item__icon">${svgUse(icon)}</div>
                <div class="list-item__body">
                    <p class="list-item__title">${esc(title)}</p>
                    <p class="list-item__desc">${esc(desc)}</p>
                </div>
                <div class="list-item__chevron">${svgUse('i-chevron-right')}</div>
            </a>`;

        screen.innerHTML = `
            <div class="page page--enter">
                ${statusbar()}
                <div class="page__scroll">
                    <div class="profile-header">
                        <div class="profile-header__top">
                            <button aria-label="Выйти">${svgUse('i-logout')}</button>
                        </div>
                        <div class="profile-avatar">${svgUse('i-user')}</div>
                        <h1 class="profile-name">Иванов Иван</h1>
                        <p class="profile-role">Экспедитор, +7 922 527-44-37</p>
                        <button class="profile-databtn">Ваши данные ${svgUse('i-chevron-right')}</button>
                    </div>

                    <div class="card">
                        <h2 class="card__title">Работа</h2>
                        <p class="card__subtitle">Быстрый доступ ко всему, что важно</p>
                        ${item('i-error', 'Претензии', 'Отчёт по штрафам', '#')}
                    </div>

                    <div class="card">
                        <h2 class="card__title">Информация и поддержка</h2>
                        ${item('i-settings', 'Настройки', 'Уведомления, язык и другое', '#')}
                        ${item('i-info', 'Помощь', 'Как пользоваться приложением', '#/help')}
                        ${item('i-mail', 'Сообщить об ошибке', 'Сформировать отчёт txt', '#')}
                        ${item('i-file', 'Договор оферты', 'Условия оказания услуг', '#')}
                        ${item('i-lock', 'Конфиденциальность', 'Политика обработки данных', '#')}
                    </div>

                    <div class="app-version">
                        <div class="app-version__label">Версия приложения</div>
                        <div class="app-version__value">4.2.15</div>
                    </div>
                </div>
                ${tabbar('profile')}
            </div>
        `;
    }

    /**
     * Главный экран помощи: поиск + sticky tab-bar + контент таба.
     * Дефолтный таб — «Популярное» (топ статей по popularity); там же
     * featured-карточка «Начало работы» для новичков.
     * Остальные табы — списки статей соответствующих категорий.
     */
    function renderHelp(activeTabId = 'popular') {
        const tabs = [
            { id: 'popular', title: 'Популярное' },
            ...data.categories.map((c) => ({ id: c.id, title: c.title })),
        ];

        // Если переданный tab невалидный — фоллбек на «popular».
        if (!tabs.find((t) => t.id === activeTabId)) activeTabId = 'popular';

        const tabsHtml = tabs
            .map(
                (t) =>
                    `<button class="tabchip ${t.id === activeTabId ? 'is-active' : ''}" data-tab="${t.id}">${esc(t.title)}</button>`
            )
            .join('');

        screen.innerHTML = `
            <div class="page page--enter">
                ${statusbar()}
                ${navbar({ title: 'Помощь' })}
                <div class="page__scroll">
                    <div class="search">
                        <span class="search__icon">${svgUse('i-search')}</span>
                        <input
                            class="search__input"
                            type="search"
                            placeholder="Поиск по статьям"
                            id="search-input"
                            autocomplete="off"
                            inputmode="search"
                        />
                        <button class="search__clear" id="search-clear" hidden aria-label="Очистить">${svgUse('i-close')}</button>
                    </div>

                    <div id="search-results"></div>

                    <div id="default-content">
                        <div class="tabs" role="tablist" aria-label="Темы помощи">
                            <div class="tabs__row" id="help-tabs">
                                ${tabsHtml}
                            </div>
                        </div>

                        <div id="tab-content"></div>
                    </div>
                </div>
            </div>
        `;

        renderTabContent(activeTabId);
        wireSearch();
        wireTabs();
    }

    /** Содержимое выбранного таба. */
    function renderTabContent(tabId) {
        const box = document.getElementById('tab-content');
        if (!box) return;

        if (tabId === 'popular') {
            const featured = data.featured;
            const articles = popularArticles(7);

            box.innerHTML = `
                <button class="featured" data-href="#/help/article/${featured.id}">
                    <div class="featured__icon">${svgUse(featured.icon)}</div>
                    <div class="featured__text">
                        <h3 class="featured__title">${esc(featured.title)}</h3>
                        <p class="featured__subtitle">${esc(featured.subtitle)}</p>
                    </div>
                    <div class="featured__chevron">${svgUse('i-chevron-right')}</div>
                </button>

                <h2 class="section__title">${svgUse('i-fire')} Часто спрашивают</h2>
                <div class="card" style="margin-top:0">
                    ${articles
                        .map((a) =>
                            listItem({
                                title: a.title,
                                desc: getCategory(a.categoryId).title,
                                href: `#/help/article/${a.id}`,
                            })
                        )
                        .join('')}
                </div>

                ${supportCtaHtml()}
                <div style="height:24px"></div>
            `;
            return;
        }

        // Категория
        const category = getCategory(tabId);
        const articles = categoryArticles(tabId);

        box.innerHTML = `
            <div class="tab-intro">${esc(category.description)}</div>
            <div class="card" style="margin-top:0">
                ${
                    articles.length
                        ? articles
                              .map((a) =>
                                  listItem({
                                      title: a.title,
                                      desc: a.excerpt,
                                      href: `#/help/article/${a.id}`,
                                  })
                              )
                              .join('')
                        : '<p class="empty__desc" style="text-align:center;padding:24px 0">В этой категории пока нет статей</p>'
                }
            </div>

            ${supportCtaHtml()}
            <div style="height:24px"></div>
        `;
    }

    function supportCtaHtml() {
        return `
            <button class="support-cta" data-action="contact-support">
                <div class="support-cta__icon">${svgUse('i-headset')}</div>
                <div class="support-cta__body">
                    <h3 class="support-cta__title">Не нашли ответ?</h3>
                    <p class="support-cta__desc">Напишите в поддержку — отвечаем за 5 минут</p>
                </div>
                <div class="list-item__chevron">${svgUse('i-chevron-right')}</div>
            </button>
        `;
    }

    /** Хук на переключение табов: обновляет URL и контент без перезагрузки. */
    function wireTabs() {
        const row = document.getElementById('help-tabs');
        if (!row) return;
        row.addEventListener('click', (e) => {
            const btn = e.target.closest('.tabchip');
            if (!btn) return;
            const tabId = btn.dataset.tab;
            row.querySelectorAll('.tabchip').forEach((el) =>
                el.classList.toggle('is-active', el === btn)
            );
            // Прокрутить активный таб в зону видимости (когда табов больше, чем влезает).
            btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            // Поменять hash без триггера hashchange (через replaceState).
            const newHash = tabId === 'popular' ? '#/help' : `#/help?tab=${tabId}`;
            history.replaceState(null, '', newHash);
            renderTabContent(tabId);
        });
    }

    /** Хук поиска: реактивно перерисовывает блок результатов. */
    function wireSearch() {
        const input = document.getElementById('search-input');
        const clear = document.getElementById('search-clear');
        const resultsBox = document.getElementById('search-results');
        const defaultContent = document.getElementById('default-content');

        if (!input) return;

        const update = () => {
            const q = input.value.trim();
            clear.hidden = q.length === 0;

            if (!q) {
                resultsBox.innerHTML = '';
                defaultContent.style.display = '';
                return;
            }

            defaultContent.style.display = 'none';
            const found = searchArticles(q);

            if (found.length === 0) {
                resultsBox.innerHTML = `
                    <div class="empty">
                        <h2 class="empty__title">Ничего не нашли</h2>
                        <p class="empty__desc">Попробуйте переформулировать запрос или напишите в поддержку.</p>
                    </div>
                `;
                return;
            }

            const itemsHtml = found
                .map((a) =>
                    listItem({
                        title: a.title,
                        desc: getCategory(a.categoryId).title,
                        href: `#/help/article/${a.id}`,
                        query: q,
                    })
                )
                .join('');

            resultsBox.innerHTML = `
                <h2 class="section__title">Найдено: ${found.length}</h2>
                <div class="card" style="margin-top:0">${itemsHtml}</div>
            `;
        };

        input.addEventListener('input', update);
        clear.addEventListener('click', () => {
            input.value = '';
            input.focus();
            update();
        });
    }

    /** Backward-compat: старая ссылка #/help/category/:id → главный экран Help с этим табом активным. */
    function redirectLegacyCategory(categoryId) {
        if (!getCategory(categoryId)) return renderNotFound();
        location.replace(`#/help?tab=${categoryId}`);
    }

    /** Экран статьи — имитация WebView. Шапка плоская, без таббара, с бейджем. */
    function renderArticle(articleId) {
        const article = getArticle(articleId);
        if (!article) return renderNotFound();
        const category = getCategory(article.categoryId);

        screen.innerHTML = `
            <div class="page page--enter">
                ${statusbar()}
                <div style="position:relative">
                    ${navbar({ title: category.title, share: true, flat: true })}
                    <div class="webview-badge">webview · cms</div>
                </div>
                <div class="page__scroll">
                    <article class="article">
                        ${article.body}
                        <div class="article__meta">
                            <span>Категория: ${esc(category.title)}</span>
                            <span>Обновлено: ${esc(article.updatedAt)}</span>
                        </div>
                    </article>
                </div>
            </div>
        `;
    }

    function renderNotFound() {
        screen.innerHTML = `
            <div class="page page--enter">
                ${statusbar()}
                ${navbar({ title: 'Не найдено' })}
                <div class="page__scroll">
                    <div class="empty">
                        <h2 class="empty__title">Раздел не найден</h2>
                        <p class="empty__desc">Возможно, статья была удалена или ссылка устарела.</p>
                    </div>
                </div>
            </div>
        `;
    }

    // ───────────────────────────────────────────────────────────
    // Роутер
    // ───────────────────────────────────────────────────────────

    function route() {
        // Hash вида "#/help?tab=payment" → path="help", query={tab:'payment'}.
        const raw = location.hash.replace(/^#\/?/, '');
        const [pathPart, queryPart = ''] = raw.split('?');
        const parts = pathPart.split('/').filter(Boolean);
        const query = Object.fromEntries(new URLSearchParams(queryPart));

        if (parts.length === 0) {
            renderProfile();
            return;
        }
        if (parts[0] === 'help' && parts.length === 1) {
            renderHelp(query.tab || 'popular');
            return;
        }
        if (parts[0] === 'help' && parts[1] === 'category' && parts[2]) {
            redirectLegacyCategory(parts[2]);
            return;
        }
        if (parts[0] === 'help' && parts[1] === 'article' && parts[2]) {
            renderArticle(parts[2]);
            return;
        }
        renderNotFound();
    }

    // Глобальные обработчики
    window.addEventListener('hashchange', () => {
        route();
        // Скролл наверх между переходами — как в нативке.
        const sc = document.querySelector('.page__scroll');
        if (sc) sc.scrollTop = 0;
    });

    document.addEventListener('click', (e) => {
        const back = e.target.closest('[data-back]');
        if (back) {
            e.preventDefault();
            if (history.length > 1) {
                history.back();
            } else {
                location.hash = '';
            }
            return;
        }

        const featured = e.target.closest('.featured');
        if (featured && featured.dataset.href) {
            e.preventDefault();
            location.hash = featured.dataset.href;
            return;
        }

        const support = e.target.closest('[data-action="contact-support"]');
        if (support) {
            e.preventDefault();
            alert('Открылся бы чат с поддержкой. В прототипе заглушка.');
            return;
        }
    });

    // Старт
    route();
})();
