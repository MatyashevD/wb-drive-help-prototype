/* ============================================================
   WB Drive · Прототип A — WebView/CMS-простыня
   Рендерит длинную страницу из window.HELP_DATA: разделы +
   аккордеоны со статьями + изображения + перекрёстные ссылки.
   Поверх — поиск, который скрывает аккордеоны без совпадений
   и подсвечивает найденное.
   ============================================================ */

(function () {
    'use strict';

    const data = window.HELP_DATA;
    const root = document.getElementById('wv-content');

    // ───────────────────────────────────────────────────────────
    // Утилиты
    // ───────────────────────────────────────────────────────────

    function esc(str) {
        if (str == null) return '';
        return String(str)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function articleAnchor(id) {
        return `wv-article-${id}`;
    }

    /** Подыскивает 1–2 «соседних» статьи для блока «Читайте также» — берём
     * случайные другие статьи из той же категории, кроме самой себя. */
    function relatedFor(article) {
        const siblings = data.articles.filter(
            (a) => a.categoryId === article.categoryId && a.id !== article.id
        );
        return siblings.slice(0, 2);
    }

    /** Внутрь HTML тела статьи добавляет блок «Читайте также» с якорными
     * ссылками на другие статьи. Это эмулирует то, что редактор CMS сам
     * вставит ссылки внутри контента. */
    function injectRelatedLinks(html, article) {
        const related = relatedFor(article);
        if (!related.length) return html;
        const linksHtml = related
            .map((a) => `<a href="#${articleAnchor(a.id)}" data-anchor>${esc(a.title)}</a>`)
            .join(' · ');
        return (
            html +
            `<div class="wv-related"><div class="wv-related__label">Читайте также</div>${linksHtml}</div>`
        );
    }

    /** В каждую вторую статью добавляет картинку-плейсхолдер: имитирует
     * иллюстрацию, которую редактор обычно вставляет в гайд. */
    function maybeInjectImage(html, article) {
        // Чтобы не загромождать: каждая статья с popularity ≥ 70 получает картинку.
        if ((article.popularity || 0) < 70) return html;
        const placeholder = `
            <div class="wv-img" aria-hidden="true">
                <div class="wv-img__inner">
                    <svg><use href="#i-image"></use></svg>
                    <span>Иллюстрация · ${esc(article.title)}</span>
                </div>
            </div>
        `;
        // Вставляем после первого <p> — типичное место «обложки» статьи.
        const firstP = html.indexOf('</p>');
        if (firstP === -1) return placeholder + html;
        return html.slice(0, firstP + 4) + placeholder + html.slice(firstP + 4);
    }

    // ───────────────────────────────────────────────────────────
    // Рендер простыни
    // ───────────────────────────────────────────────────────────

    function renderSheet() {
        const html = data.categories
            .map((category) => {
                const articles = data.articles
                    .filter((a) => a.categoryId === category.id)
                    .sort((a, b) => b.popularity - a.popularity);

                const accordions = articles
                    .map((article) => {
                        let body = article.body;
                        body = injectRelatedLinks(body, article);
                        body = maybeInjectImage(body, article);

                        return `
                            <details
                                class="wv-acc"
                                id="${articleAnchor(article.id)}"
                                data-title="${esc(article.title.toLowerCase())}"
                                data-tags="${esc((article.tags || []).join(' ').toLowerCase())}"
                                data-text="${esc(article.body.replace(/<[^>]+>/g, ' ').toLowerCase())}"
                            >
                                <summary class="wv-acc__summary">
                                    <span class="wv-acc__title">${esc(article.title)}</span>
                                    ${article.popularity >= 85 ? '<span class="wv-acc__pop">Часто спрашивают</span>' : ''}
                                    <svg class="wv-acc__chevron"><use href="#i-chevron-right"></use></svg>
                                </summary>
                                <div class="wv-acc__body">${body}</div>
                            </details>
                        `;
                    })
                    .join('');

                return `
                    <section class="wv-section" data-category="${category.id}">
                        <h2 class="wv-section__title">
                            <svg><use href="#${category.icon}"></use></svg>
                            ${esc(category.title)}
                        </h2>
                        <p class="wv-section__lead">${esc(category.description)}</p>
                        ${accordions}
                    </section>
                `;
            })
            .join('');

        root.innerHTML = html;
    }

    // ───────────────────────────────────────────────────────────
    // Поиск-фильтр по простыне
    // ───────────────────────────────────────────────────────────

    const SEARCH_DEBOUNCE = 120;
    let searchTimer = null;
    const empty = document.getElementById('wv-empty');
    const hint = document.getElementById('wv-hint');
    const input = document.getElementById('wv-input');

    /** Обернуть найденные вхождения query в <mark>, не ломая HTML. */
    function highlightInPlace(rootEl, query) {
        // Снимаем подсветку предыдущего поиска.
        rootEl.querySelectorAll('mark.match').forEach((m) => {
            const text = document.createTextNode(m.textContent);
            m.replaceWith(text);
        });
        rootEl.normalize();

        if (!query) return;

        const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');

        // Обходим текстовые узлы, оборачиваем найденное.
        const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest('summary')) return NodeFilter.FILTER_ACCEPT;
                if (parent.closest('.wv-acc__body')) return NodeFilter.FILTER_ACCEPT;
                return NodeFilter.FILTER_REJECT;
            },
        });

        const nodes = [];
        let n;
        while ((n = walker.nextNode())) nodes.push(n);

        nodes.forEach((node) => {
            const text = node.nodeValue;
            if (!re.test(text)) {
                re.lastIndex = 0;
                return;
            }
            re.lastIndex = 0;
            const frag = document.createDocumentFragment();
            let lastIdx = 0;
            text.replace(re, (m, offset) => {
                if (offset > lastIdx) {
                    frag.appendChild(document.createTextNode(text.slice(lastIdx, offset)));
                }
                const mark = document.createElement('mark');
                mark.className = 'match';
                mark.textContent = m;
                frag.appendChild(mark);
                lastIdx = offset + m.length;
                return m;
            });
            if (lastIdx < text.length) {
                frag.appendChild(document.createTextNode(text.slice(lastIdx)));
            }
            node.parentNode.replaceChild(frag, node);
        });
    }

    function applyFilter() {
        const q = (input.value || '').trim().toLowerCase();
        const accs = root.querySelectorAll('.wv-acc');
        const sections = root.querySelectorAll('.wv-section');

        if (!q) {
            // Сброс: всё видно, всё свернуто, подсветка снята.
            accs.forEach((a) => {
                a.classList.remove('is-hidden');
                a.open = false;
            });
            sections.forEach((s) => s.classList.remove('is-hidden'));
            empty.classList.remove('is-visible');
            highlightInPlace(root, '');
            hint.innerHTML = 'Полнотекстовый поиск по статьям. Нажмите на раздел — раскроется ответ.';
            return;
        }

        let foundCount = 0;
        accs.forEach((acc) => {
            const haystack = `${acc.dataset.title} ${acc.dataset.tags} ${acc.dataset.text}`;
            if (haystack.includes(q)) {
                acc.classList.remove('is-hidden');
                acc.open = true;
                foundCount++;
            } else {
                acc.classList.add('is-hidden');
                acc.open = false;
            }
        });

        // Скрыть категории без видимых статей.
        sections.forEach((sec) => {
            const visible = sec.querySelectorAll('.wv-acc:not(.is-hidden)').length;
            sec.classList.toggle('is-hidden', visible === 0);
        });

        empty.classList.toggle('is-visible', foundCount === 0);
        highlightInPlace(root, q);
        hint.innerHTML =
            foundCount > 0
                ? `Найдено: <b>${foundCount}</b>. Подсвечены совпадения.`
                : 'Ничего не найдено по этому запросу.';
    }

    // ───────────────────────────────────────────────────────────
    // Хуки
    // ───────────────────────────────────────────────────────────

    document.addEventListener('click', (e) => {
        // Якорные ссылки внутри простыни — плавный скролл и раскрытие цели.
        const link = e.target.closest('a[data-anchor]');
        if (link) {
            e.preventDefault();
            const id = link.getAttribute('href').replace(/^#/, '');
            const target = document.getElementById(id);
            if (target) {
                target.open = true;
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }

        // CTA «Написать в поддержку».
        if (e.target.closest('#wv-support')) {
            alert('Открылся бы чат с поддержкой. В прототипе заглушка.');
        }
    });

    input.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(applyFilter, SEARCH_DEBOUNCE);
    });

    // Старт
    renderSheet();
})();
