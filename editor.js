(function() {
    // --- CONFIGURATION & REGISTRY ---
    const TAILWIND_CDN = 'https://cdn.tailwindcss.com';
    
    const OPTIONS = {
        textSize: ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl'],
        fontFamily: ['font-sans', 'font-serif', 'font-mono'],
        fontWeight: ['font-thin', 'font-extralight', 'font-light', 'font-normal', 'font-medium', 'font-semibold', 'font-bold', 'font-extrabold', 'font-black'],
        rounded: ['rounded-none', 'rounded-sm', 'rounded', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-full'],
        borderWidth: ['border-0', 'border', 'border-2', 'border-4', 'border-8'],
        textAlign: ['text-left', 'text-center', 'text-right', 'text-justify'],
        flexDir: ['flex-row', 'flex-col', 'flex-row-reverse', 'flex-col-reverse'],
        justify: ['justify-start', 'justify-end', 'justify-center', 'justify-between', 'justify-around', 'justify-evenly'],
        items: ['items-start', 'items-end', 'items-center', 'items-baseline', 'items-stretch']
    };

    // --- STATE ---
    let selectedElement = null;
    let clipboardElement = null;
    let clipboardStyles = "";
    let mouseX = 0, mouseY = 0;
    let isReordering = false;

    // --- DOM HELPER (The core of the refactor) ---
    // Creates HTML elements instantly: el('div', {className: 'box'}, ['Child text'])
    function el(tag, props = {}, children = []) {
        const element = document.createElement(tag);
        for (let [key, value] of Object.entries(props)) {
            if (key.startsWith('on') && typeof value === 'function') element[key] = value;
            else if (key === 'className') element.className = value;
            else if (key === 'style') Object.assign(element.style, value);
            else if (key === 'dataset') Object.assign(element.dataset, value);
            else element[key] = value;
        }
        if (!Array.isArray(children)) children = [children];
        children.forEach(child => {
            if (child == null) return;
            if (typeof child === 'string' || typeof child === 'number') element.appendChild(document.createTextNode(child));
            else if (child instanceof Node) element.appendChild(child);
        });
        return element;
    }

    // --- ELEMENTS REGISTRY ---
    const ELEMENTS_REGISTRY = [
        {
            category: "Container",
            items: [
                { id: 'div', label: 'DIV', create: () => el('div', { className: "min-w-[150px] min-h-[150px] bg-gray-100 border-2 border-dashed border-gray-300 p-4 m-2 flex flex-col" }) },
                { id: 'section', label: 'SECTION', create: () => el('section', { className: "w-full min-h-[200px] p-8 m-2 bg-white border border-gray-200 flex flex-col" }) }
            ]
        },
        {
            category: "Text",
            items: [
                { id: 'heading', label: 'HEADING', create: () => el('h1', { className: "text-4xl font-bold text-gray-800 m-2", innerText: "New Heading" }) },
                { id: 'paragraph', label: 'PARAGRAPH', create: () => el('p', { className: "text-base text-gray-600 m-2 leading-relaxed", innerText: "This is a new paragraph. You can edit this text to add your own content." }) }
            ]
        },
        {
            category: "Visual",
            items: [
                { id: 'img', label: 'IMAGE', create: () => el('img', { className: "w-[150px] h-auto m-2", src: "https://via.placeholder.com/150" }) }
            ]
        }
    ];

    // --- INTERNAL STYLES ---
    const EDITOR_CSS = `
        .proto-handle { position: absolute; width: 12px; height: 12px; z-index: 2147483647; pointer-events: auto; box-shadow: 0 1px 3px rgba(0,0,0,0.3); border-radius: 2px; transition: transform 0.1s; }
        .proto-handle:hover { transform: scale(1.4); z-index: 2147483648; }
        .handle-resize { background: white; border: 1px solid #3b82f6; } .handle-resize:hover { background: #3b82f6; }
        .handle-pad { background: #4ade80; border: 1px solid #16a34a; border-radius: 50%; } .handle-pad:hover { background: #16a34a; }
        .handle-marg { background: #fb923c; border: 1px solid #ea580c; } .handle-marg:hover { background: #ea580c; }
        .proto-overlay { position: fixed; pointer-events: none; z-index: 2147483646; border: 2px solid #3b82f6; transition: none; }
        .proto-input { background: #f9fafb; border: 1px solid #d1d5db; border-radius: 3px; padding: 2px 4px; font-size: 10px; width: 100%; font-family: monospace; text-align: center; }
        .proto-input:focus { outline: none; border-color: #3b82f6; background: white; }
        /* Menu & Accessibility */
        .proto-row.is-expanded .proto-flyout { display: flex !important; }
        .proto-row:focus { outline: 2px solid #3b82f6; outline-offset: -2px; background-color: #eff6ff; }
        .proto-breadcrumbs { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(30, 41, 59, 0.9); backdrop-filter: blur(4px); color: white; padding: 6px 16px; border-radius: 20px; display: flex; align-items: center; gap: 8px; font-family: monospace; font-size: 12px; z-index: 2147483647; box-shadow: 0 4px 6px rgba(0,0,0,0.2); }
        .proto-crumb { cursor: pointer; opacity: 0.7; transition: all 0.2s; border: none; background: none; color: inherit; padding: 0; font-family: inherit; }
        .proto-crumb:hover { opacity: 1; text-decoration: underline; } .proto-crumb.active { opacity: 1; font-weight: bold; color: #60a5fa; } .proto-sep { opacity: 0.4; }
    `;

    // --- MANAGERS ---
    const TwManager = {
        patterns: {
            width: /^w-/, height: /^h-/, minWidth: /^min-w-/, minHeight: /^min-h-/, maxWidth: /^max-w-/, maxHeight: /^max-h-/, 
            pt: /^pt-/, pr: /^pr-/, pb: /^pb-/, pl: /^pl-/, mt: /^mt-/, mr: /^mr-/, mb: /^mb-/, ml: /^ml-/,
            padding: /^p-/, margin: /^m-/, bgColor: /^bg-/, textColor: /^text-(?!xs|sm|base|lg|xl|\d+xl|left|center|right|justify)/, 
            textSize: /^text-(xs|sm|base|lg|xl|\d+xl)/, fontFamily: /^font-(sans|serif|mono)/, fontWeight: /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)/,
            rounded: /^rounded-/, borderWidth: /^border(-[0248])?$|^border$/, flexDir: /^flex-(row|col)/, justify: /^justify-/, items: /^items-/, textAlign: /^text-(left|center|right|justify)/, flex: /^flex$/ 
        },
        update: (elTarget, category, newValue) => {
            const pattern = TwManager.patterns[category]; const toRemove = [];
            elTarget.classList.forEach(cls => { if (pattern.test(cls)) toRemove.push(cls); });
            toRemove.forEach(c => elTarget.classList.remove(c));
            if (newValue && newValue.trim() !== '') elTarget.classList.add(newValue.trim());
        },
        getValue: (elTarget, category) => {
            const pattern = TwManager.patterns[category]; let match = '';
            elTarget.classList.forEach(cls => { if (pattern.test(cls)) match = cls; });
            if (category === 'borderWidth' && match === '' && elTarget.classList.contains('border')) return 'border'; return match;
        },
        getUnknown: (elTarget) => {
            const known = Object.values(TwManager.patterns); const unknown = [];
            elTarget.classList.forEach(cls => { if (!known.some(regex => regex.test(cls))) unknown.push(cls); });
            return unknown.join(' ');
        },
        setUnknown: (elTarget, newString) => {
            TwManager.getUnknown(elTarget).split(/\s+/).filter(c => c).forEach(c => elTarget.classList.remove(c));
            newString.split(/\s+/).filter(c => c).forEach(c => elTarget.classList.add(c));
        }
    };

    const HistoryManager = {
        undoStack: [], redoStack: [], maxDepth: 50,
        getCleanState: () => {
            const clone = document.body.cloneNode(true);
            clone.querySelectorAll('#proto-menu, .proto-overlay, .proto-handle, .proto-breadcrumbs').forEach(elTarget => elTarget.remove());
            return clone.innerHTML;
        },
        pushState: () => { HistoryManager.undoStack.push(HistoryManager.getCleanState()); if (HistoryManager.undoStack.length > HistoryManager.maxDepth) HistoryManager.undoStack.shift(); HistoryManager.redoStack = []; },
        undo: () => { if (HistoryManager.undoStack.length === 0) return; HistoryManager.redoStack.push(HistoryManager.getCleanState()); HistoryManager.restore(HistoryManager.undoStack.pop()); },
        redo: () => { if (HistoryManager.redoStack.length === 0) return; HistoryManager.undoStack.push(HistoryManager.getCleanState()); HistoryManager.restore(HistoryManager.redoStack.pop()); },
        restore: (htmlContent) => { MenuManager.close(); if (selectedElement) { selectedElement = null; OverlayManager.update(); BreadcrumbManager.update(); } document.body.innerHTML = htmlContent; scanAndHydrate(); }
    };

    const OverlayManager = {
        overlay: null,
        update: () => {
            if (!selectedElement) { if (OverlayManager.overlay) { OverlayManager.overlay.remove(); OverlayManager.overlay = null; } return; }
            if (!OverlayManager.overlay) {
                OverlayManager.overlay = el('div', { className: 'proto-overlay' });
                const handles = [
                    { type: 'resize-r',  cls: 'handle-resize', cursor: 'ew-resize' }, { type: 'resize-b',  cls: 'handle-resize', cursor: 'ns-resize' }, { type: 'resize-br', cls: 'handle-resize', cursor: 'nwse-resize' },
                    { type: 'pt', cls: 'handle-pad', cursor: 'ns-resize', title: 'Padding Top', side: 'pt' }, { type: 'pr', cls: 'handle-pad', cursor: 'ew-resize', title: 'Padding Right', side: 'pr' }, { type: 'pb', cls: 'handle-pad', cursor: 'ns-resize', title: 'Padding Bottom', side: 'pb' }, { type: 'pl', cls: 'handle-pad', cursor: 'ew-resize', title: 'Padding Left', side: 'pl' },
                    { type: 'mt', cls: 'handle-marg', cursor: 'ns-resize', title: 'Margin Top', side: 'mt' }, { type: 'mr', cls: 'handle-marg', cursor: 'ew-resize', title: 'Margin Right', side: 'mr' }, { type: 'mb', cls: 'handle-marg', cursor: 'ns-resize', title: 'Margin Bottom', side: 'mb' }, { type: 'ml', cls: 'handle-marg', cursor: 'ew-resize', title: 'Margin Left', side: 'ml' }
                ];
                handles.forEach(h => {
                    const handle = el('div', { className: `proto-handle ${h.cls}`, title: h.title, dataset: { type: h.type }, style: { cursor: h.cursor }, onmousedown: (e) => { e.stopPropagation(); e.preventDefault(); OverlayManager.startDrag(e, h.type, handle); }});
                    OverlayManager.overlay.appendChild(handle);
                });
                document.body.appendChild(OverlayManager.overlay);
            }
            const rect = selectedElement.getBoundingClientRect();
            Object.assign(OverlayManager.overlay.style, { top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px` });
            const style = window.getComputedStyle(selectedElement);
            const p = { t: parseFloat(style.paddingTop)||0, r: parseFloat(style.paddingRight)||0, b: parseFloat(style.paddingBottom)||0, l: parseFloat(style.paddingLeft)||0 };
            const m = { t: parseFloat(style.marginTop)||0, r: parseFloat(style.marginRight)||0, b: parseFloat(style.marginBottom)||0, l: parseFloat(style.marginLeft)||0 };
            const setPos = (type, css) => { const h = OverlayManager.overlay.querySelector(`[data-type="${type}"]`); if(h) Object.assign(h.style, css); };
            setPos('resize-r',  { top: '50%', right: '-6px', transform: 'translateY(-50%)' }); setPos('resize-b',  { bottom: '-6px', left: '50%', transform: 'translateX(-50%)' }); setPos('resize-br', { bottom: '-6px', right: '-6px' });
            setPos('pt', { top: `${Math.max(10, p.t)}px`, left: '50%', transform: 'translateX(-50%)' }); setPos('pb', { bottom: `${Math.max(10, p.b)}px`, left: '50%', transform: 'translateX(-50%)' });
            setPos('pl', { left: `${Math.max(10, p.l)}px`, top: '50%', transform: 'translateY(-50%)' }); setPos('pr', { right: `${Math.max(10, p.r)}px`, top: '50%', transform: 'translateY(-50%)' });
            setPos('mt', { top: `-${Math.max(15, m.t)}px`, left: '50%', transform: 'translateX(-50%)' }); setPos('mb', { bottom: `-${Math.max(15, m.b)}px`, left: '50%', transform: 'translateX(-50%)' });
            setPos('ml', { left: `-${Math.max(15, m.l)}px`, top: '50%', transform: 'translateY(-50%)' }); setPos('mr', { right: `-${Math.max(15, m.r)}px`, top: '50%', transform: 'translateY(-50%)' });
        },
        startDrag: (e, type, handleElement) => {
            HistoryManager.pushState(); const startX = e.clientX; const startY = e.clientY;
            const rect = selectedElement.getBoundingClientRect(); const style = window.getComputedStyle(selectedElement);
            const initial = { w: rect.width, h: rect.height, pt: parseFloat(style.paddingTop)||0, pr: parseFloat(style.paddingRight)||0, pb: parseFloat(style.paddingBottom)||0, pl: parseFloat(style.paddingLeft)||0, mt: parseFloat(style.marginTop)||0, mr: parseFloat(style.marginRight)||0, mb: parseFloat(style.marginBottom)||0, ml: parseFloat(style.marginLeft)||0 };
            const onMove = (ev) => {
                const dx = ev.clientX - startX; const dy = ev.clientY - startY; const s = selectedElement.style; const os = OverlayManager.overlay.style;
                if (type.startsWith('resize')) {
                    if (type.includes('r')) { const w = Math.max(10, initial.w + dx); s.width = `${w}px`; os.width = `${w}px`; }
                    if (type.includes('b')) { const h = Math.max(10, initial.h + dy); s.height = `${h}px`; os.height = `${h}px`; }
                }
                if (type === 'pt') { const v=Math.max(0,initial.pt+dy); s.paddingTop=`${v}px`; handleElement.style.top=`${Math.max(10,v)}px`; }
                if (type === 'pb') { const v=Math.max(0,initial.pb-dy); s.paddingBottom=`${v}px`; handleElement.style.bottom=`${Math.max(10,v)}px`; }
                if (type === 'pl') { const v=Math.max(0,initial.pl+dx); s.paddingLeft=`${v}px`; handleElement.style.left=`${Math.max(10,v)}px`; }
                if (type === 'pr') { const v=Math.max(0,initial.pr-dx); s.paddingRight=`${v}px`; handleElement.style.right=`${Math.max(10,v)}px`; }
                if (type === 'mt') { const v=initial.mt-dy; s.marginTop=`${v}px`; os.top=`${rect.top-dy}px`; handleElement.style.top=`-${Math.max(15,v)}px`; }
                if (type === 'mb') { const v=initial.mb+dy; s.marginBottom=`${v}px`; handleElement.style.bottom=`-${Math.max(15,v)}px`; }
                if (type === 'ml') { const v=initial.ml-dx; s.marginLeft=`${v}px`; os.left=`${rect.left-dx}px`; handleElement.style.left=`-${Math.max(15,v)}px`; }
                if (type === 'mr') { const v=initial.mr+dx; s.marginRight=`${v}px`; handleElement.style.right=`-${Math.max(15,v)}px`; }
            };
            const onUp = () => {
                window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
                const s = selectedElement.style;
                [{ p: 'width', tw: 'width', px: 'w' }, { p: 'height', tw: 'height', px: 'h' }, { p: 'paddingTop', tw: 'pt', px: 'pt' }, { p: 'paddingRight', tw: 'pr', px: 'pr' }, { p: 'paddingBottom', tw: 'pb', px: 'pb' }, { p: 'paddingLeft', tw: 'pl', px: 'pl' }, { p: 'marginTop', tw: 'mt', px: 'mt' }, { p: 'marginRight', tw: 'mr', px: 'mr' }, { p: 'marginBottom', tw: 'mb', px: 'mb' }, { p: 'marginLeft', tw: 'ml', px: 'ml' }].forEach(m => { if(s[m.p]){ TwManager.update(selectedElement, m.tw, `${m.px}-[${s[m.p]}]`); s[m.p] = ''; } });
                document.body.classList.add('jit-refresh'); setTimeout(() => { document.body.classList.remove('jit-refresh'); OverlayManager.update(); }, 50);
            };
            window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
        }
    };

    const BreadcrumbManager = {
        bar: null,
        update: () => {
            if (!BreadcrumbManager.bar) { BreadcrumbManager.bar = el('div', { className: 'proto-breadcrumbs' }); document.body.appendChild(BreadcrumbManager.bar); }
            if (!selectedElement) { BreadcrumbManager.bar.style.display = 'none'; return; }
            BreadcrumbManager.bar.style.display = 'flex'; BreadcrumbManager.bar.innerHTML = ''; 
            const chain = []; let curr = selectedElement;
            while(curr && curr !== document.documentElement) { chain.unshift(curr); if (curr === document.body) break; curr = curr.parentElement; }
            chain.forEach((element, index) => {
                let label = element.tagName.toLowerCase();
                if (element.id && !element.id.startsWith('proto')) label += `#${element.id}`;
                else if (element.classList.length > 0) { const cls = Array.from(element.classList).find(c => !c.startsWith('w-') && !c.startsWith('h-')) || element.classList[0]; if (cls) label += `.${cls}`; }
                if(label.length > 15) label = label.substring(0, 12) + '...';
                
                const btn = el('button', {
                    className: `proto-crumb ${element === selectedElement ? 'active' : ''}`, 
                    innerText: label,
                    onclick: (e) => { e.stopPropagation(); MenuManager.close(); selectedElement = element; OverlayManager.update(); BreadcrumbManager.update(); }
                });
                BreadcrumbManager.bar.appendChild(btn);
                if (index < chain.length - 1) BreadcrumbManager.bar.appendChild(el('span', { className: 'proto-sep', innerText: '>' }));
            });
        }
    };

    // --- MENU MANAGER (The New UI Builder) ---
    const MenuManager = {
        close: () => { const m = document.getElementById('proto-menu'); if (m) m.remove(); },
        createBase: (x, y) => el('div', { id: 'proto-menu', className: 'fixed z-[2147483647] bg-white border border-gray-200 shadow-2xl rounded-lg flex flex-col min-w-[140px] font-mono text-xs p-0', style: { top: `${y}px`, left: `${x}px` } }),
        
        createFlyoutRow: (label, flyoutItems, openLeft) => {
            const arrow = openLeft ? "◀" : "▶";
            const row = el('div', { className: "proto-row group relative px-3 py-2 hover:bg-blue-50 cursor-default flex justify-between items-center text-gray-700 font-bold text-[11px] border-b border-gray-50 last:border-0", tabIndex: 0 }, [
                el('span', {}, [label]), el('span', { className: "text-gray-400 text-[8px]" }, [arrow])
            ]);
            const flyoutClass = `proto-flyout hidden absolute top-0 bg-white border border-gray-200 shadow-xl rounded-lg p-2 z-[50] ${openLeft ? "right-full mr-1" : "left-full ml-1"}`;
            const flyout = el('div', { className: flyoutClass }, flyoutItems);
            
            const expandFlyout = (ev) => {
                const activeTag = document.activeElement ? document.activeElement.tagName : '';
                if (ev.type === 'mouseenter' && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag) && !row.contains(document.activeElement)) return; 
                const menu = document.getElementById('proto-menu');
                if (menu) menu.querySelectorAll('.proto-row').forEach(r => r.classList.remove('is-expanded'));
                row.classList.add('is-expanded');
            };
            row.addEventListener('mouseenter', expandFlyout); row.addEventListener('focusin', expandFlyout);
            row.appendChild(flyout); return row;
        },
        
        createInputRow: (label, element) => el('div', { className: "flex justify-between items-center mb-2 last:mb-0" }, [ el('span', { className: "text-gray-500 font-medium mr-2 w-16 truncate", innerText: label }), element ]),
        
        createQuadRow: (label, categories) => {
            const grid = el('div', {className: "grid grid-cols-2 gap-1"});
            ['Top', 'Right', 'Bottom', 'Left'].forEach((pos, i) => {
                grid.appendChild(el('input', { type: 'text', className: "proto-input text-center", placeholder: pos, value: TwManager.getValue(selectedElement, categories[i]), onchange: (e) => { HistoryManager.pushState(); TwManager.update(selectedElement, categories[i], e.target.value); OverlayManager.update(); } }));
            });
            return el('div', { className: "flex flex-col mb-2 last:mb-0" }, [ el('div', { className: "flex justify-between mb-1" }, [ el('span', { className: "text-gray-500 font-medium", innerText: label }) ]), grid ]);
        },

        openContextMenu: (e) => {
            MenuManager.close();
            const openLeft = (e.clientX + 380) > window.innerWidth;
            const menu = MenuManager.createBase(e.clientX, e.clientY);
            const tag = selectedElement.tagName;

            menu.appendChild(el('div', { className: "px-3 py-2 bg-gray-800 text-white font-mono font-bold text-center uppercase tracking-widest text-[10px] rounded-t-md", innerText: `<${tag.toLowerCase()}>` }));

            // NEW: Helper to generate dropdown options safely
            const buildOptions = (arr) => [{v: '', t: '-'}, ...arr.map(o => ({v: o, t: o}))].map(opt => el('option', {value: opt.v, innerText: opt.t}));

            // 1. Text Controls
            if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'SPAN', 'BUTTON', 'A'].includes(tag)) {
                const controls = [];
                if (/^H[1-6]$/.test(tag)) {
                    const sel = el('select', { className: "proto-input flex-1 bg-blue-50 font-bold border-blue-200", value: tag, onchange: () => {
                        HistoryManager.pushState(); const newEl = el(sel.value, { className: selectedElement.className, innerHTML: selectedElement.innerHTML, id: selectedElement.id });
                        selectedElement.parentNode.replaceChild(newEl, selectedElement); makeEditable(newEl); selectedElement = newEl; OverlayManager.update(); BreadcrumbManager.update(); MenuManager.close();
                    }}, ['H1','H2','H3','H4','H5','H6'].map(t => el('option', {value: t, innerText: t})));
                    controls.push(MenuManager.createInputRow('Tag', sel));
                }
                controls.push(el('textarea', { className: "w-full border border-gray-300 rounded p-1 text-xs mb-2 font-sans h-16 focus:outline-none focus:border-blue-500", value: selectedElement.innerText, onchange: (ev) => { HistoryManager.pushState(); selectedElement.innerText = ev.target.value; }}));
                
                ['fontFamily', 'fontWeight', 'textSize', 'textAlign'].forEach(cat => {
                    const sel = el('select', { className: "proto-input flex-1", value: TwManager.getValue(selectedElement, cat), onchange: (ev) => { HistoryManager.pushState(); TwManager.update(selectedElement, cat, ev.target.value); }}, buildOptions(OPTIONS[cat]));
                    controls.push(MenuManager.createInputRow(cat.replace('text','').replace('font',''), sel));
                });
                controls.push(MenuManager.createInputRow('Color', el('input', { type: 'text', className: "proto-input flex-1", value: TwManager.getValue(selectedElement, 'textColor'), onchange: (ev) => { HistoryManager.pushState(); TwManager.update(selectedElement, 'textColor', ev.target.value); }})));
                menu.appendChild(MenuManager.createFlyoutRow("Text & Content", [el('div', {className: 'w-[240px] flex flex-col'}, controls)], openLeft));
            }

            // 2. Dimensions & Layout
            const layoutControls = [];
            ['width', 'height', 'padding', 'margin'].forEach(cat => {
                layoutControls.push(MenuManager.createInputRow(cat.charAt(0).toUpperCase() + cat.slice(1), el('input', { type: 'text', className: "proto-input flex-1", value: TwManager.getValue(selectedElement, cat), onchange: (ev) => { HistoryManager.pushState(); TwManager.update(selectedElement, cat, ev.target.value); OverlayManager.update(); } })));
            });
            layoutControls.push(MenuManager.createQuadRow('Padding Sides', ['pt', 'pr', 'pb', 'pl']));
            layoutControls.push(MenuManager.createQuadRow('Margin Sides', ['mt', 'mr', 'mb', 'ml']));
            
            if (tag === 'DIV' || tag === 'SECTION') {
                layoutControls.push(el('div', { className: "mt-3 mb-2 text-[9px] text-gray-400 font-bold uppercase border-t border-gray-100 pt-2", innerText: "Flexbox" }));
                const isFlex = selectedElement.classList.contains('flex');
                layoutControls.push(el('div', { className: "flex justify-between items-center mb-2 last:mb-0" }, [
                    el('span', { className: "text-gray-500 font-medium mr-2", innerText: "Enable Flex" }),
                    el('input', { type: 'checkbox', checked: isFlex, onchange: (ev) => { HistoryManager.pushState(); if(ev.target.checked) selectedElement.classList.add('flex'); else selectedElement.classList.remove('flex'); OverlayManager.update(); } })
                ]));
                ['flexDir', 'justify', 'items'].forEach(cat => {
                    const sel = el('select', { className: "proto-input flex-1", value: TwManager.getValue(selectedElement, cat), onchange: (ev) => { HistoryManager.pushState(); TwManager.update(selectedElement, cat, ev.target.value); }}, buildOptions(OPTIONS[cat]));
                    layoutControls.push(MenuManager.createInputRow(cat, sel));
                });
            }
            menu.appendChild(MenuManager.createFlyoutRow("Dimensions & Layout", [el('div', {className: 'w-[240px] flex flex-col'}, layoutControls)], openLeft));

            // 3. Appearance
            const appearanceControls = [];
            ['bgColor', 'borderWidth', 'rounded'].forEach(cat => {
                let inputEl;
                if (OPTIONS[cat]) {
                    inputEl = el('select', { className: "proto-input flex-1", value: TwManager.getValue(selectedElement, cat), onchange: (ev) => { HistoryManager.pushState(); TwManager.update(selectedElement, cat, ev.target.value); }}, buildOptions(OPTIONS[cat]));
                } else {
                    inputEl = el('input', { type: 'text', className: "proto-input flex-1", value: TwManager.getValue(selectedElement, cat), onchange: (ev) => { HistoryManager.pushState(); TwManager.update(selectedElement, cat, ev.target.value); }});
                }
                appearanceControls.push(MenuManager.createInputRow(cat.replace('Color','').replace('Width','').replace('rounded','Radius'), inputEl));
            });
            if (tag === 'IMG') {
                appearanceControls.push(MenuManager.createInputRow('Src URL', el('input', { type: 'text', className: "proto-input text-left flex-1", value: selectedElement.src, onchange: (ev) => { HistoryManager.pushState(); selectedElement.src = ev.target.value; } })));
            }
            menu.appendChild(MenuManager.createFlyoutRow("Appearance", [el('div', {className: 'w-[240px] flex flex-col'}, appearanceControls)], openLeft));

            // 4. Style Transfer
            menu.appendChild(MenuManager.createFlyoutRow("Style Transfer", [
                el('div', {className: 'w-[140px] flex flex-col'}, [
                    el('button', { className: "w-full text-left px-2 py-1 mb-1 bg-gray-50 hover:bg-blue-50 rounded text-gray-700 font-bold border border-gray-200", innerText: "Copy Styles", onclick: (ev) => { ev.stopPropagation(); clipboardStyles = selectedElement.className; ev.target.innerText = "Copied!"; setTimeout(()=>ev.target.innerText="Copy Styles", 1000); }}),
                    el('button', { className: "w-full text-left px-2 py-1 bg-gray-50 hover:bg-blue-50 rounded text-gray-700 font-bold border border-gray-200", innerText: "Paste Styles", onclick: () => { if(clipboardStyles){ HistoryManager.pushState(); selectedElement.className = clipboardStyles; OverlayManager.update(); } }})
                ])
            ], openLeft));

            // 5. Extras
            menu.appendChild(MenuManager.createFlyoutRow("Extras", [
                el('div', {className: 'w-[240px] flex flex-col'}, [
                    el('div', { className: "text-[9px] text-gray-400 mb-2 leading-tight", innerText: "Custom classes unsupported by the UI (e.g. shadow-xl)" }),
                    el('textarea', { className: "w-full border border-gray-300 rounded p-1 text-xs font-mono h-16 focus:outline-none focus:border-blue-500 bg-gray-50", placeholder: "e.g. shadow-lg", value: TwManager.getUnknown(selectedElement), onchange: (ev) => { HistoryManager.pushState(); TwManager.setUnknown(selectedElement, ev.target.value); OverlayManager.update(); }})
                ])
            ], openLeft));

            // 6. Delete
            menu.appendChild(el('button', { className: "w-full text-left px-3 py-2 text-red-600 font-bold hover:bg-red-50 border-t border-gray-100 rounded-b-md text-[11px]", innerText: "Delete Element", onclick: () => { if(confirm("Delete?")) { HistoryManager.pushState(); selectedElement.remove(); selectedElement = null; OverlayManager.update(); BreadcrumbManager.update(); MenuManager.close(); }}}));
            
            document.body.appendChild(menu);
            const firstRow = menu.querySelector('.proto-row'); if(firstRow) firstRow.focus();
        },

        openAddMenu: (e) => {
            MenuManager.close();
            const openLeft = (mouseX + 280) > window.innerWidth;
            const menu = MenuManager.createBase(mouseX, mouseY);
            
            ELEMENTS_REGISTRY.forEach(categoryGroup => {
                const buttons = categoryGroup.items.map(opt => el('button', {
                    className: "w-full text-left px-3 py-2 hover:bg-blue-50 hover:text-blue-600 text-gray-700 font-bold transition-colors border-b border-gray-50 last:border-0",
                    innerText: opt.label,
                    onclick: (ev) => { 
                        ev.stopPropagation(); HistoryManager.pushState();
                        const newEl = opt.create();
                        makeEditable(newEl); (selectedElement || document.body).appendChild(newEl); 
                        MenuManager.close(); selectedElement = newEl; OverlayManager.update(); BreadcrumbManager.update();
                    }
                }));
                menu.appendChild(MenuManager.createFlyoutRow(categoryGroup.category, [el('div', {className: 'w-[140px] flex flex-col'}, buttons)], openLeft));
            });

            document.body.appendChild(menu);
            const firstRow = menu.querySelector('.proto-row'); if(firstRow) firstRow.focus();
        }
    };

    // --- MAIN INIT ---
    function makeEditable(elTarget) {
        if (elTarget._figma_bound) return; elTarget._figma_bound = true; elTarget.dataset.editable = "true";
        if (elTarget.tagName === 'DIV' && elTarget.innerHTML.trim() === '') elTarget.classList.add('min-w-[50px]', 'min-h-[50px]', 'border', 'border-dashed', 'border-gray-300');
        elTarget.addEventListener('click', (ev) => {
            if (document.getElementById('proto-menu')) return;
            ev.stopPropagation(); selectedElement = elTarget; OverlayManager.update(); BreadcrumbManager.update();
        });
    }

    function initializeEnvironment() {
        if (!document.getElementById('editor-ui-styles')) document.head.appendChild(el('style', {id: 'editor-ui-styles', textContent: EDITOR_CSS}));
        let hasTailwind = false; document.querySelectorAll('script').forEach(s => { if (s.src && s.src.includes('tailwindcss')) hasTailwind = true; });
        if (!hasTailwind) { 
            document.querySelectorAll('link[rel="stylesheet"], style').forEach(elTarget => { if (elTarget.id !== 'editor-ui-styles') elTarget.disabled = true; });
            for (let e of document.body.getElementsByTagName("*")) e.removeAttribute("style"); document.body.removeAttribute("style");
            document.head.appendChild(el('script', { src: TAILWIND_CDN, onload: () => { document.body.classList.add('jit-wake-up'); setTimeout(() => document.body.classList.remove('jit-wake-up'), 0); } }));
        }
        scanAndHydrate();
    }
    
    function scanAndHydrate() {
        for (let elTarget of document.body.getElementsByTagName('*')) {
            if (elTarget.tagName === 'SCRIPT' || (elTarget.id && elTarget.id.startsWith('proto-')) || elTarget.className.includes('proto-')) continue;
            makeEditable(elTarget);
        }
    }

    initializeEnvironment();
    document.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
    document.addEventListener('contextmenu', (e) => { if (selectedElement) { e.preventDefault(); MenuManager.openContextMenu(e); } });
    document.addEventListener('keyup', (e) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) isReordering = false; });

    // --- SHORTCUTS & NAV ---
    document.addEventListener('keydown', (e) => {
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag);

        // Copy/Paste Elements
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedElement && !isTyping) { e.preventDefault(); clipboardElement = selectedElement.cloneNode(true); const old = selectedElement.style.opacity; selectedElement.style.opacity = '0.5'; setTimeout(() => selectedElement.style.opacity = old || '', 150); }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && clipboardElement && !isTyping) { e.preventDefault(); HistoryManager.pushState(); const clone = clipboardElement.cloneNode(true); if (selectedElement && selectedElement.parentNode) { selectedElement.parentNode.insertBefore(clone, selectedElement.nextElementSibling); } else { document.body.appendChild(clone); } makeEditable(clone); for(let child of clone.getElementsByTagName('*')) makeEditable(child); MenuManager.close(); selectedElement = clone; OverlayManager.update(); BreadcrumbManager.update(); }

        // Undo/Redo/Add
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !isTyping) { e.preventDefault(); if (e.shiftKey) HistoryManager.redo(); else HistoryManager.undo(); }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !isTyping) { e.preventDefault(); HistoryManager.redo(); }
        if (e.shiftKey && e.key.toLowerCase() === 'a' && !isTyping) { e.preventDefault(); MenuManager.openAddMenu(); }
        if (e.key === 'Escape') { MenuManager.close(); selectedElement = null; OverlayManager.update(); BreadcrumbManager.update(); }

        // Arrow Keys (Menu Navigation & DOM Manipulation)
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            const menu = document.getElementById('proto-menu');
            if (menu) {
                e.preventDefault(); const active = document.activeElement;
                if (active.classList.contains('proto-row')) {
                    if (e.key === 'ArrowDown' && active.nextElementSibling) active.nextElementSibling.focus();
                    if (e.key === 'ArrowUp' && active.previousElementSibling) active.previousElementSibling.focus();
                    if (e.key === 'ArrowRight') { const flyout = active.querySelector('.proto-flyout'); if (flyout) { const firstInput = flyout.querySelector('input, select, textarea, button'); if (firstInput) firstInput.focus(); }}
                } else if (active.closest('.proto-flyout')) {
                    const flyout = active.closest('.proto-flyout'); const inputs = Array.from(flyout.querySelectorAll('input, select, textarea, button')); const idx = inputs.indexOf(active);
                    if (e.key === 'ArrowDown' && idx < inputs.length - 1) inputs[idx + 1].focus();
                    if (e.key === 'ArrowUp' && idx > 0) inputs[idx - 1].focus();
                    if (e.key === 'ArrowLeft') { const row = flyout.closest('.proto-row'); if (row) row.focus(); }
                } return;
            }

            if (selectedElement && !isTyping) {
                e.preventDefault();
                const isValidTarget = (elTarget) => elTarget && elTarget.tagName !== 'SCRIPT' && elTarget.tagName !== 'STYLE' && !elTarget.id.startsWith('proto-') && !elTarget.className.includes('proto-');
                
                if (e.shiftKey) { // Move Node
                    if (!isReordering) { HistoryManager.pushState(); isReordering = true; }
                    const p = selectedElement.parentNode; const next = selectedElement.nextElementSibling; const prev = selectedElement.previousElementSibling;
                    if (e.key === 'ArrowLeft' && prev) p.insertBefore(selectedElement, prev); 
                    else if (e.key === 'ArrowRight' && next) p.insertBefore(selectedElement, next.nextElementSibling);
                    else if (e.key === 'ArrowUp' && p !== document.body) p.parentNode.insertBefore(selectedElement, p.nextElementSibling);
                    else if (e.key === 'ArrowDown' && next && isValidTarget(next) && !['IMG','INPUT','BR','HR'].includes(next.tagName)) next.insertBefore(selectedElement, next.firstChild);
                    OverlayManager.update(); BreadcrumbManager.update();
                } else { // Change Selection
                    let target = null;
                    if (e.key === 'ArrowUp') target = (selectedElement.parentElement && selectedElement.parentElement !== document.documentElement) ? selectedElement.parentElement : null;
                    else if (e.key === 'ArrowDown') { let child = selectedElement.firstElementChild; while (child && !isValidTarget(child)) child = child.nextElementSibling; target = child; } 
                    else if (e.key === 'ArrowLeft') { let prev = selectedElement.previousElementSibling; while (prev && !isValidTarget(prev)) prev = prev.previousElementSibling; target = prev; } 
                    else if (e.key === 'ArrowRight') { let next = selectedElement.nextElementSibling; while (next && !isValidTarget(next)) next = next.nextElementSibling; target = next; }
                    if (target) { selectedElement = target; makeEditable(selectedElement); OverlayManager.update(); BreadcrumbManager.update(); }
                }
            }
        }
    });
})();