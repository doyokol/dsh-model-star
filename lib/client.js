/**
 * dsh-model-star —— 浏览器半区。
 *
 * 三件事：
 *   1. 每个模型行右侧加星标按钮，点一下收藏 / 取消；
 *   2. 收藏的模型汇总到菜单最顶部的「置顶」分组——**跨供应方全局生效**，
 *      不再只是把某个 provider 分组里的行往上挪；
 *   3. 原位置只留星标、不动行的样式，方便就地取消。
 *
 * 为什么置顶分组是克隆的副本，而不是把原按钮搬过去：
 * 菜单归 React 管。`div#<uid>-models[role="menu"]` 的直接子节点是
 * `section[data-menu-group]`，行是 `button[role="menuitemradio"]`。
 * 把真实节点搬到另一个父节点后，React 下次 diff 会按它自己的引用做
 * insertBefore / removeChild：轻则顺序被打回，重则抛 NotFoundError 白屏。
 * 所以置顶区放 cloneNode 的副本，点击时转发给原按钮——original.click()
 * 依然是真实 DOM 事件，React 的 onClick 照常执行。
 *
 * 其余 DOM 事实（全部用语义属性，不用哈希类名）：
 *   - 菜单滚动容器： [role="menu"]，id 形如 "<uid>-models"
 *   - 提供方分组：   section[data-menu-group]，标题 div[data-menu-group-heading]
 *   - 每个模型行：   button[role="menuitemradio"]，title=模型名
 *   - 搜索框：       input[role="searchbox"][aria-controls="<菜单 id>"]
 * React 只在 keyed 列表顺序变化时移动节点，我们追加的星标按钮和置顶分组
 * 不受影响；每批 DOM 变更都会重新对账一次（签名相同就跳过，避免观察器自激）。
 */
window.__ModuleLoader__.load({
	id: "dsh-model-star",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const API = "/dsh-model-star/api";
		const LS_KEY = "dsh-model-star.favorites";
		const SEP = "\u0000";
		const CLS_BTN = "dsh-model-star-btn";
		const CLS_ON = "dsh-model-star-on";
		const CLS_PIN = "dsh-model-star-pin";
		const CLS_PROV = "dsh-model-star-prov";
		const ATTR_PIN = "data-dsh-model-star-pin";
		const ATTR_SIG = "data-dsh-model-star-sig";
		const STYLE_ID = "dsh-model-star-style";
		const PIN_LABEL = "\u7f6e\u9876";

		const CSS = `
.${CLS_BTN}{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;margin:0 2px 0 4px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-text-tertiary,#8b8f96);font-size:12px;line-height:1;cursor:pointer;opacity:.5;transition:opacity .12s ease,color .12s ease,background .12s ease}
.${CLS_BTN}:hover{opacity:1;background:var(--dsw-alias-fill-quaternary,rgba(127,127,127,.16))}
.${CLS_BTN}.${CLS_ON}{color:#f0a92a;opacity:1}
.${CLS_PROV}{flex:0 0 auto;margin-left:8px;max-width:42%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:1.2;color:var(--dsw-alias-text-tertiary,#8b8f96);opacity:.85}
/* 置顶标题不吸附：让整组随内容正常滚走，而不是黏在菜单顶部再被下一组顶飞。
   颜色也不动，沿用原版分组标题的字体色。 */
.${CLS_PIN} > [data-menu-group-heading]{position:static !important;background:transparent !important;color:var(--dsw-alias-label-tertiary,#8b8f96)}
`;

		const favorites = new Set();
		let observer = null;
		let frame = 0;
		let seq = 0;
		let disposed = false;

		// —— 存储：宿主落盘为主，localStorage 兜底 ——

		function readLocal() {
			try {
				const raw = localStorage.getItem(LS_KEY);
				if (!raw) return null;
				const parsed = JSON.parse(raw);
				return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : null;
			} catch {
				return null;
			}
		}

		function writeLocal() {
			try {
				localStorage.setItem(LS_KEY, JSON.stringify([...favorites]));
			} catch {
				/* quota / private mode */
			}
		}

		async function pullRemote() {
			try {
				const response = await fetch(API, { headers: { accept: "application/json" } });
				if (!response.ok) return false;
				const data = await response.json();
				if (!data || !Array.isArray(data.favorites)) return false;
				favorites.clear();
				for (const item of data.favorites) if (typeof item === "string") favorites.add(item);
				writeLocal();
				return true;
			} catch {
				return false;
			}
		}

		function pushRemote() {
			try {
				fetch(API, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ favorites: [...favorites] }),
					keepalive: true,
				}).catch(() => {});
			} catch {
				/* ignore */
			}
		}

		// —— 星标状态 ——

		function toggle(key) {
			if (!key) return;
			if (favorites.has(key)) favorites.delete(key);
			else favorites.add(key);
			writeLocal();
			pushRemote();
			schedule();
		}

		// —— DOM 对账 ——

		function injectStyle() {
			if (document.getElementById(STYLE_ID)) return;
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.dataset.plugin = "dsh-model-star";
			style.textContent = CSS;
			(document.head || document.documentElement).appendChild(style);
		}

		function starOf(row) {
			for (const child of row.children) {
				if (child.classList && child.classList.contains(CLS_BTN)) return child;
			}
			return null;
		}

		function modelNameOf(row) {
			const title = row.getAttribute("title");
			if (typeof title === "string" && title.trim().length > 0) return title.trim();
			const copy = row.querySelector('[class*="modelName"]');
			return copy ? (copy.textContent || "").trim() : "";
		}

		function ensureStar(row, key, on) {
			let button = starOf(row);
			if (button === null) {
				button = document.createElement("button");
				button.type = "button";
				button.className = CLS_BTN;
				button.textContent = "\u2605";
				button.setAttribute("aria-label", "\u7f6e\u9876\u5e38\u7528\u6a21\u578b");
				button.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					toggle(key);
				});
				row.appendChild(button);
			}
			button.classList.toggle(CLS_ON, on);
			button.title = on ? "\u53d6\u6d88\u7f6e\u9876" : "\u7f6e\u9876\u5230\u9876\u90e8";
			button.setAttribute("aria-pressed", on ? "true" : "false");
		}

		function sectionsOf(menu) {
			const direct = [];
			for (const child of menu.children) {
				if (child.tagName !== "SECTION") continue;
				if (!child.hasAttribute("data-menu-group")) continue;
				if (child.hasAttribute(ATTR_PIN)) continue;
				direct.push(child);
			}
			if (direct.length > 0) return direct;
			const nested = [];
			for (const section of menu.querySelectorAll("section[data-menu-group]")) {
				if (section.hasAttribute(ATTR_PIN)) continue;
				nested.push(section);
			}
			return nested;
		}

		function rowsOf(section) {
			const rows = [];
			for (const child of section.children) {
				if (child.tagName !== "BUTTON") continue;
				if (child.getAttribute("role") !== "menuitemradio") continue;
				rows.push(child);
			}
			return rows;
		}

		function childWith(parent, attribute) {
			for (const child of parent.children) {
				if (child.hasAttribute(attribute)) return child;
			}
			return null;
		}

		function providerOf(section) {
			const heading = childWith(section, "data-menu-group-heading");
			return heading ? (heading.textContent || "").trim() : "";
		}

		function searchQueryOf(menu) {
			const id = menu.getAttribute("id");
			if (typeof id !== "string" || id.length === 0) return "";
			for (const input of document.querySelectorAll('input[role="searchbox"]')) {
				if (input.getAttribute("aria-controls") !== id) continue;
				return String(input.value || "").trim();
			}
			return "";
		}

		function pinnedSection(menu) {
			for (const child of menu.children) {
				if (child.tagName === "SECTION" && child.hasAttribute(ATTR_PIN)) return child;
			}
			return null;
		}

		function collect(menu) {
			const entries = [];
			for (const section of sectionsOf(menu)) {
				const provider = providerOf(section);
				for (const row of rowsOf(section)) {
					const name = modelNameOf(row);
					if (name.length === 0) continue;
					entries.push({
						section,
						provider,
						row,
						name,
						key: provider + SEP + name,
						on: false,
					});
				}
			}
			return entries;
		}

		/** 置顶分组里的行：克隆原件，点行转发给原件，点星标就地取消。 */
		function buildPinnedRow(entry) {
			const row = entry.row.cloneNode(true);
			row.removeAttribute("id");
			row.removeAttribute("data-highlighted");
			row.removeAttribute("aria-activedescendant");
			row.setAttribute("tabindex", "-1");
			const oldStar = starOf(row);
			if (oldStar !== null) oldStar.remove();

			const check = row.querySelector('[class*="check"]');
			const provider = document.createElement("span");
			provider.className = CLS_PROV;
			provider.textContent = entry.provider;
			if (check !== null && check.parentElement === row) row.insertBefore(provider, check);
			else row.appendChild(provider);

			ensureStar(row, entry.key, true);
			row.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				const origin = entry.row;
				if (origin === null || !origin.isConnected || origin.disabled) return;
				origin.click();
			});
			return row;
		}

		function buildPinnedSection(menu, starred) {
			const template = sectionsOf(menu)[0] || null;
			const section = document.createElement("section");
			section.className = template ? template.className : "";
			section.setAttribute("role", "group");
			section.setAttribute("data-menu-group", "");
			section.setAttribute(ATTR_PIN, "");
			section.classList.add(CLS_PIN);

			const headingId = "dsh-model-star-heading-" + (seq += 1);
			const start = document.createElement("span");
			start.setAttribute("aria-hidden", "true");
			start.setAttribute("data-menu-group-start", "");
			const heading = document.createElement("div");
			heading.setAttribute("data-menu-group-heading", "");
			if (template !== null) {
				const startTemplate = childWith(template, "data-menu-group-start");
				const headingTemplate = childWith(template, "data-menu-group-heading");
				if (startTemplate !== null) start.className = startTemplate.className;
				if (headingTemplate !== null) heading.className = headingTemplate.className;
			}
			heading.id = headingId;
			heading.textContent = PIN_LABEL;
			section.setAttribute("aria-labelledby", headingId);
			section.appendChild(start);
			section.appendChild(heading);
			for (const entry of starred) section.appendChild(buildPinnedRow(entry));
			return section;
		}

		function signatureOf(entries, starred) {
			let selected = "";
			for (const entry of entries) {
				if (entry.row.getAttribute("aria-checked") === "true") {
					selected = entry.key;
					break;
				}
			}
			const keys = [];
			for (const entry of starred) keys.push(entry.key);
			return keys.join("\u0001") + "\u0002" + selected + "\u0002" + String(entries.length);
		}

		function applyMenu(menu) {
			if (menu.hasAttribute("hidden")) return;
			const entries = collect(menu);
			if (entries.length === 0) return;

			for (const entry of entries) {
				entry.on = favorites.has(entry.key);
				ensureStar(entry.row, entry.key, entry.on);
			}

			const query = searchQueryOf(menu);
			const starred = [];
			for (const entry of entries) if (entry.on && entry.row.isConnected) starred.push(entry);

			// 搜索态下菜单只显示命中的行，置顶区会变成噪音，直接收起来。
			if (query.length > 0 || starred.length === 0) {
				const stale = pinnedSection(menu);
				if (stale !== null) stale.remove();
				return;
			}

			// 顺序跟下面各分组一致：先按 provider 分组先后，再按组内行序。
			// collect() 本来就是按这个顺序遍历的，不用再排。

			const signature = signatureOf(entries, starred);
			const current = pinnedSection(menu);
			if (current !== null) {
				if (current.getAttribute(ATTR_SIG) === signature && menu.firstElementChild === current) return;
				current.remove();
			}
			const section = buildPinnedSection(menu, starred);
			section.setAttribute(ATTR_SIG, signature);
			menu.insertBefore(section, menu.firstChild);
		}

		function applyAll() {
			injectStyle();
			for (const menu of document.querySelectorAll('[role="menu"]')) {
				const id = menu.getAttribute("id");
				if (typeof id !== "string" || !id.endsWith("-models")) continue;
				try {
					applyMenu(menu);
				} catch (error) {
					console.warn("[dsh-model-star] apply failed:", error);
				}
			}
		}

		function observe() {
			if (!observer || disposed) return;
			const root = document.body || document.documentElement;
			if (root) observer.observe(root, { childList: true, subtree: true });
		}

		function run() {
			if (disposed) return;
			if (observer) observer.disconnect();
			try {
				applyAll();
			} catch (error) {
				console.warn("[dsh-model-star] apply failed:", error);
			} finally {
				observe();
			}
		}

		function schedule() {
			if (disposed || frame !== 0) return;
			const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
			frame = raf(() => {
				frame = 0;
				run();
			});
		}

		function apply(ctx) {
			const local = readLocal();
			if (local) for (const item of local) favorites.add(item);

			ctx.effect(() => {
				injectStyle();
				observer = new MutationObserver(() => schedule());
				observe();
				schedule();
				return () => {
					disposed = true;
					if (observer) observer.disconnect();
					observer = null;
				};
			}, "dsh-model-star: model picker starring");

			pullRemote().then(() => schedule());
		}

		exports.apply = apply;
		exports.inject = [];
		return module.exports;
	},
});
