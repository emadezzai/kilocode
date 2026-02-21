import * as chromeLauncher from "chrome-launcher"
import { type Browser, connect, type Page } from "puppeteer-core"
import * as vscode from "vscode"
import { ClineProvider } from "../../core/webview/ClineProvider"

/**
 * ElementPickerBrowser opens a real Chrome browser window with an injected
 * element picker overlay. Users browse normally, pick elements, and send
 * them to the Kilo Code chat.
 */
export class ElementPickerBrowser {
	private static instance: ElementPickerBrowser | undefined
	private browser: Browser | undefined
	private page: Page | undefined
	private chromeProcess: chromeLauncher.LaunchedChrome | undefined
	private statusBarItem: vscode.StatusBarItem | undefined

	public static async launch() {
		// If already running, focus it
		if (ElementPickerBrowser.instance?.browser?.connected) {
			try {
				const page = ElementPickerBrowser.instance.page
				if (page) {
					await page.bringToFront()
				}
				return
			} catch {
				await ElementPickerBrowser.instance.dispose()
			}
		}

		const inst = new ElementPickerBrowser()
		ElementPickerBrowser.instance = inst

		try {
			await inst.start()
		} catch (error) {
			console.error("Failed to launch element picker browser:", error)
			vscode.window.showErrorMessage(
				`Failed to launch browser: ${error instanceof Error ? error.message : String(error)}`,
			)
			await inst.dispose()
		}
	}

	private async start() {
		const chromePath = await this.findChrome()
		if (!chromePath) {
			throw new Error("Could not find Chrome installation")
		}

		// Launch Chrome (non-headless) with remote debugging
		this.chromeProcess = await chromeLauncher.launch({
			chromePath,
			chromeFlags: ["--no-first-run", "--no-default-browser-check", "--window-size=1280,900"],
			startingUrl: "about:blank",
		})

		console.log(`Chrome launched on port ${this.chromeProcess.port}`)

		// Connect puppeteer to the launched Chrome via debugging port
		this.browser = await connect({
			browserURL: `http://localhost:${this.chromeProcess.port}`,
			defaultViewport: null,
		})

		// Get the blank page
		const pages = await this.browser.pages()
		this.page = pages[0] || (await this.browser.newPage())

		// Setup element picker on this page
		await this.setupPage(this.page)

		// Navigate to Google
		await this.page.goto("https://www.google.com", { waitUntil: "domcontentloaded" })

		// Setup new tabs automatically
		this.browser.on("targetcreated", async (target) => {
			if (target.type() === "page") {
				try {
					const newPage = await target.page()
					if (newPage) {
						await this.setupPage(newPage)
						this.page = newPage
					}
				} catch (err) {
					console.error("Failed to setup new page:", err)
				}
			}
		})

		// Handle browser close
		this.browser.on("disconnected", () => {
			this.dispose()
		})

		this.showStatusBar()

		vscode.window.showInformationMessage(
			"Kilo Code Element Picker is active! Use the 🎯 button in the browser to pick elements.",
		)
	}

	/**
	 * Setup a page: expose the callback function and auto-inject picker script
	 */
	private async setupPage(page: Page): Promise<void> {
		// Expose callback for sending elements to Kilo Code
		try {
			await page.exposeFunction("__clineSendElements", async (json: string) => {
				try {
					const elements = JSON.parse(json) as Array<{
						selector: string
						xpath: string
						html: string
						tagName: string
					}>
					await this.sendElementsToChat(elements)
				} catch (err) {
					console.error("Failed to process elements:", err)
				}
			})
		} catch {
			// Already exposed
		}

		// Auto-inject on every future navigation
		const script = this.getPickerScript()
		await page.evaluateOnNewDocument(script)

		// Inject now (page may already be loaded)
		try {
			await page.evaluate(script)
		} catch {
			// Ignore if page is navigating
		}

		// Backup: re-inject on load event
		page.on("load", async () => {
			try {
				await page.evaluate(script)
			} catch {
				// Ignore
			}
		})
	}

	private async findChrome(): Promise<string | undefined> {
		try {
			const path = chromeLauncher.Launcher.getFirstInstallation()
			if (path && !path.includes(".Trash")) {
				return path
			}
		} catch {
			console.log("Could not find system Chrome")
		}
		return undefined
	}

	/**
	 * Returns the picker injection function to be executed in the browser context
	 */
	private getPickerScript() {
		// This entire function runs in the BROWSER context
		return function clinePickerInit() {
			if (document.getElementById("cline-element-picker-root")) return

			const root = document.createElement("div")
			root.id = "cline-element-picker-root"
			root.style.cssText =
				"position:fixed;bottom:0;left:0;right:0;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"

			const shadow = root.attachShadow({ mode: "closed" })

			shadow.innerHTML = `
				<style>
					* { margin:0; padding:0; box-sizing:border-box; }
					.cline-bar {
						display:flex; align-items:center; justify-content:space-between;
						padding:8px 16px; gap:12px;
						background:linear-gradient(135deg,#1a1a2e,#16213e);
						border-top:2px solid #e85d04;
						color:#fff; font-size:13px;
						box-shadow:0 -4px 20px rgba(0,0,0,0.3);
					}
					.cline-left, .cline-right { display:flex; align-items:center; gap:10px; }
					.cline-center { display:flex; align-items:center; gap:6px; flex-wrap:wrap; flex:1; justify-content:center; }
					.cline-brand { font-weight:700; font-size:13px; color:#e85d04; }
					.cline-btn {
						padding:6px 14px; border:none; border-radius:6px; cursor:pointer;
						font-size:12px; font-weight:600; transition:all 0.2s; white-space:nowrap;
					}
					.cline-btn-pick { background:#e85d04; color:#fff; }
					.cline-btn-pick:hover { background:#f48c06; transform:scale(1.03); }
					.cline-btn-pick.active { background:#d00000; animation:pulse 1.5s infinite; }
					@keyframes pulse {
						0%,100% { box-shadow:0 0 0 0 rgba(208,0,0,0.4); }
						50% { box-shadow:0 0 0 6px rgba(208,0,0,0); }
					}
					.cline-btn-send { background:#2196F3; color:#fff; }
					.cline-btn-send:hover { background:#42a5f5; }
					.cline-btn-send:disabled { opacity:0.4; cursor:not-allowed; }
					.cline-btn-clear { background:rgba(255,255,255,0.1); color:#aaa; }
					.cline-btn-clear:hover { background:rgba(255,255,255,0.2); color:#fff; }
					.cline-tag {
						display:inline-flex; align-items:center; gap:4px;
						padding:3px 8px; background:rgba(232,93,4,0.2);
						border:1px solid rgba(232,93,4,0.4); border-radius:4px;
						font-size:11px; color:#f48c06;
					}
					.cline-tag-x { cursor:pointer; opacity:0.6; font-size:14px; line-height:1; }
					.cline-tag-x:hover { opacity:1; }
					.cline-count { color:#888; font-size:12px; }
					.cline-min {
						background:none; border:none; color:#888; cursor:pointer;
						font-size:18px; padding:2px 6px; border-radius:4px;
					}
					.cline-min:hover { color:#fff; background:rgba(255,255,255,0.1); }
					.cline-bar.mini { padding:4px 12px; justify-content:flex-end; }
					.cline-bar.mini .cline-left,
					.cline-bar.mini .cline-center,
					.cline-bar.mini .cline-right { display:none; }
				</style>
				<div class="cline-bar" id="bar">
					<div class="cline-left">
						<span class="cline-brand">🎯 Kilo Code</span>
						<button class="cline-btn cline-btn-pick" id="pickBtn">Pick Element</button>
					</div>
					<div class="cline-center" id="tags">
						<span class="cline-count">Click "Pick Element" to start</span>
					</div>
					<div class="cline-right">
						<button class="cline-btn cline-btn-clear" id="clearBtn" style="display:none">Clear</button>
						<button class="cline-btn cline-btn-send" id="sendBtn" disabled>Send to Chat</button>
					</div>
					<button class="cline-min" id="minBtn" title="Minimize">▾</button>
				</div>
			`

			document.documentElement.appendChild(root)

			const bar = shadow.getElementById("bar")!
			const pickBtn = shadow.getElementById("pickBtn")!
			const sendBtn = shadow.getElementById("sendBtn")! as HTMLButtonElement
			const clearBtn = shadow.getElementById("clearBtn")! as HTMLElement
			const tags = shadow.getElementById("tags")!
			const minBtn = shadow.getElementById("minBtn")!

			let pickerOn = false
			let selected: Array<{ selector: string; xpath: string; html: string; tagName: string }> = []
			let hovered: HTMLElement | null = null
			let isMin = false

			const pickerCSS = document.createElement("style")
			pickerCSS.id = "cline-picker-css"
			pickerCSS.textContent = `
				.cline-hover { outline:3px solid #e85d04 !important; outline-offset:2px !important; cursor:crosshair !important; background-color:rgba(232,93,4,0.08) !important; }
				.cline-selected { outline:3px solid #2196F3 !important; outline-offset:2px !important; background-color:rgba(33,150,243,0.08) !important; }
			`

			minBtn.addEventListener("click", () => {
				isMin = !isMin
				bar.classList.toggle("mini", isMin)
				minBtn.textContent = isMin ? "▴ Kilo Code" : "▾"
			})

			pickBtn.addEventListener("click", () => {
				pickerOn = !pickerOn
				pickBtn.classList.toggle("active", pickerOn)
				pickBtn.textContent = pickerOn ? "⏹ Stop" : "Pick Element"
				if (pickerOn) {
					document.head.appendChild(pickerCSS)
					document.addEventListener("mouseover", onOver, true)
					document.addEventListener("mouseout", onOut, true)
					document.addEventListener("click", onClick, true)
				} else {
					pickerCSS.remove()
					document.removeEventListener("mouseover", onOver, true)
					document.removeEventListener("mouseout", onOut, true)
					document.removeEventListener("click", onClick, true)
					if (hovered) {
						hovered.classList.remove("cline-hover")
						hovered = null
					}
				}
			})

			sendBtn.addEventListener("click", () => {
				if (!selected.length) return
				;(window as any).__clineSendElements(JSON.stringify(selected))
				clearAll()
				if (pickerOn) pickBtn.click()
			})

			clearBtn.addEventListener("click", clearAll)

			function clearAll() {
				document.querySelectorAll(".cline-selected").forEach((el) => el.classList.remove("cline-selected"))
				selected = []
				refreshUI()
			}

			function onOver(e: Event) {
				const t = e.target as HTMLElement
				if (!t || root.contains(t)) return
				e.preventDefault()
				e.stopPropagation()
				if (t === hovered) return
				if (hovered) hovered.classList.remove("cline-hover")
				t.classList.add("cline-hover")
				hovered = t
			}

			function onOut(e: Event) {
				const t = e.target as HTMLElement
				if (!t) return
				t.classList.remove("cline-hover")
				if (hovered === t) hovered = null
			}

			function onClick(e: Event) {
				const t = e.target as HTMLElement
				if (!t || root.contains(t)) return
				e.preventDefault()
				e.stopPropagation()
				e.stopImmediatePropagation()
				t.classList.remove("cline-hover")

				const sel = cssPath(t)
				const xp = getXPath(t)
				const tag = t.tagName.toLowerCase()
				let html = t.outerHTML
				if (html.length > 5000) html = html.substring(0, 5000) + "\n<!-- truncated -->"

				const idx = selected.findIndex((x) => x.selector === sel)
				if (idx >= 0) {
					selected.splice(idx, 1)
					t.classList.remove("cline-selected")
				} else {
					selected.push({ selector: sel, xpath: xp, html, tagName: tag })
					t.classList.add("cline-selected")
				}
				refreshUI()
			}

			function getXPath(el: Element): string {
				if (el.id !== "") return `//*[@id="${el.id}"]`
				if (el === document.body) return el.tagName.toLowerCase()

				let ix = 0
				const siblings = el.parentNode?.children
				if (siblings) {
					for (let i = 0; i < siblings.length; i++) {
						const sibling = siblings[i]
						if (sibling === el) {
							return (
								getXPath(el.parentNode as Element) +
								"/" +
								el.tagName.toLowerCase() +
								"[" +
								(ix + 1) +
								"]"
							)
						}
						if (sibling.nodeType === 1 && sibling.tagName === el.tagName) {
							ix++
						}
					}
				}
				return ""
			}

			function cssPath(el: Element): string {
				const parts: string[] = []
				let cur: Element | null = el
				while (cur && cur.nodeType === 1 && parts.length < 5) {
					let s = cur.tagName.toLowerCase()
					if (cur.id) {
						parts.unshift("#" + cur.id)
						break
					}
					if (cur.className && typeof cur.className === "string") {
						const cls = cur.className
							.split(/\s+/)
							.filter((c) => c && !c.startsWith("cline-"))
							.slice(0, 2)
						if (cls.length) s += "." + cls.join(".")
					}
					const p = cur.parentElement
					if (p) {
						const sibs = Array.from(p.children).filter((c) => c.tagName === cur!.tagName)
						if (sibs.length > 1) s += ":nth-child(" + (sibs.indexOf(cur) + 1) + ")"
					}
					parts.unshift(s)
					cur = cur.parentElement
				}
				return parts.join(" > ")
			}

			function refreshUI() {
				const n = selected.length
				sendBtn.disabled = n === 0
				clearBtn.style.display = n > 0 ? "inline-block" : "none"
				tags.innerHTML = ""
				if (n === 0) {
					tags.innerHTML = '<span class="cline-count">Click "Pick Element" to start</span>'
				} else {
					const cnt = document.createElement("span")
					cnt.className = "cline-count"
					cnt.textContent = n + " selected: "
					tags.appendChild(cnt)
					selected.forEach((el, i) => {
						const t = document.createElement("span")
						t.className = "cline-tag"
						t.innerHTML = `&lt;${el.tagName}&gt; <span class="cline-tag-x" data-i="${i}">×</span>`
						tags.appendChild(t)
					})
					tags.querySelectorAll(".cline-tag-x").forEach((btn) => {
						btn.addEventListener("click", (ev) => {
							const i = Number.parseInt((ev.target as HTMLElement).getAttribute("data-i") || "0")
							const rem = selected[i]
							if (rem) {
								try {
									const el = document.querySelector(rem.selector)
									if (el) el.classList.remove("cline-selected")
								} catch {
									/* ignore */
								}
							}
							selected.splice(i, 1)
							refreshUI()
						})
					})
				}
			}
		}
	}

	/**
	 * Send selected elements to the Kilo Code chat
	 */
	private async sendElementsToChat(
		elements: Array<{ selector: string; xpath: string; html: string; tagName: string }>,
	): Promise<void> {
		if (elements.length === 0) return

		const parts = elements.map((el, i) => {
			return `### Element ${i + 1}: \`<${el.tagName}>\`\n**CSS**: \`${el.selector}\`\n**XPath**: \`${el.xpath}\`\n\n\`\`\`html\n${el.html}\n\`\`\``
		})

		const message = `Browser Elements Selected:\n\n${parts.join("\n\n")}`
		const images: string[] = []

		if (this.page) {
			for (const el of elements) {
				try {
					const handle = await this.page.$(el.selector)
					if (handle) {
						// Scroll element into view for screenshot if needed
						await handle.evaluate((node) => node.scrollIntoView({ behavior: "instant", block: "center" }))
						// Add a slight delay for scrolling / animation to settle
						await new Promise((resolve) => setTimeout(resolve, 100))

						const screenshot = await handle.screenshot({ encoding: "base64" })
						images.push(`data:image/png;base64,${screenshot}`)
					}
				} catch (e) {
					console.error("Failed to take screenshot for element:", el.selector, e)
				}
			}
		}

		try {
			const provider = ClineProvider.getVisibleInstance()
			if (provider) {
				await provider.postMessageToWebview({ type: "insertTextToChatArea", text: message, images })
			}
			vscode.window.showInformationMessage(`${elements.length} element(s) sent to Kilo Code chat!`)
		} catch (error) {
			console.error("Failed to send elements to chat:", error)
			vscode.window.showErrorMessage("Failed to send elements to chat")
		}
	}

	private showStatusBar() {
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
		this.statusBarItem.text = "$(globe) Kilo Code Picker Active"
		this.statusBarItem.tooltip = "Kilo Code Element Picker is running in Chrome"
		this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground")
		this.statusBarItem.show()
	}

	async dispose() {
		try {
			if (this.browser?.connected) {
				await this.browser.close()
			}
		} catch {
			/* ignore */
		}

		try {
			if (this.chromeProcess) {
				await this.chromeProcess.kill()
			}
		} catch {
			/* ignore */
		}

		if (this.statusBarItem) {
			this.statusBarItem.dispose()
			this.statusBarItem = undefined
		}

		this.browser = undefined
		this.page = undefined
		this.chromeProcess = undefined
		ElementPickerBrowser.instance = undefined
	}
}
