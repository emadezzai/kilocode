import * as chromeLauncher from "chrome-launcher"
import { type Browser, connect, type Page } from "puppeteer-core"
import * as vscode from "vscode"
import { ClineProvider } from "../../core/webview/ClineProvider"

/**
 * ElementPickerBrowser opens a real Chrome browser window with an injected
 * element picker overlay. Users browse normally, pick elements, and send
 * them to the Kilo Code chat.
 *
 * Features:
 * - Element picking with CSS/XPath selectors
 * - Action recording (clicks, form changes)
 * - Design mode (contentEditable)
 * - Style editor with CSS property editing
 * - NEW: Add new CSS rules (not just modify existing)
 * - NEW: Apply changes to code via AI agent
 * - NEW: Theme testing (light/dark mode)
 * - NEW: Full page screenshots
 * - NEW: Console output viewer
 * - NEW: Network traffic viewer
 */
export class ElementPickerBrowser {
	public static instance: ElementPickerBrowser | undefined
	private browser: Browser | undefined
	public page: Page | undefined
	private chromeProcess: chromeLauncher.LaunchedChrome | undefined
	private statusBarItem: vscode.StatusBarItem | undefined
	private capturedErrors: string[] = []
	private failedNetworkRequests: string[] = []
	private consoleLogs: string[] = []
	private networkRequests: string[] = []

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

		// Navigate to browser default URL or fallback to Google
		const provider = await ClineProvider.getInstance()
		const { browserDefaultUrl } = provider ? await provider.getState() : { browserDefaultUrl: undefined }
		const startUrl = browserDefaultUrl || "https://www.google.com"

		await this.page.goto(startUrl, { waitUntil: "domcontentloaded" })

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
					const payload = JSON.parse(json) as {
						elements: Array<{
							selector: string
							xpath: string
							html: string
							tagName: string
							componentName?: string
							sourceFile?: string
						}>
						actions: string[]
						designEdits?: Array<{ selector: string; text: string; html: string }>
						styleEdits?: Array<{ selector: string; css: string }>
						addedCssRules?: string[]
						applyToCode?: boolean
						consoleLogs?: string[]
						networkRequests?: string[]
					}
					// Support for backward compatibility if old payload was cached
					if (Array.isArray(payload)) {
						await this.sendElementsToChat(payload, [], [], [])
					} else {
						await this.sendElementsToChat(
							payload.elements || [],
							payload.actions || [],
							payload.designEdits || [],
							payload.styleEdits || [],
							payload.addedCssRules || [],
							payload.applyToCode || false,
							payload.consoleLogs || [],
							payload.networkRequests || [],
						)
					}
				} catch (err) {
					console.error("Failed to process elements:", err)
				}
			})
		} catch {
			// Already exposed
		}

		// Expose function for requesting screenshot
		try {
			await page.exposeFunction("__clineRequestScreenshot", async () => {
				try {
					if (this.page) {
						const screenshot = await this.page.screenshot({ encoding: "base64", fullPage: true })
						const message = `### 📷 Full Page Screenshot\nA full page screenshot has been captured.`
						const images = [`data:image/png;base64,${screenshot}`]
						const provider = ClineProvider.getVisibleInstance()
						if (provider) {
							await provider.postMessageToWebview({ type: "insertTextToChatArea", text: message, images })
						}
					}
				} catch (err) {
					console.error("Failed to take screenshot:", err)
				}
			})
		} catch {
			// Already exposed
		}

		// Expose function for getting console logs without sending
		try {
			await page.exposeFunction("__clineGetConsoleLogs", async () => {
				return this.consoleLogs
			})
		} catch {
			// Already exposed
		}

		// Expose function for getting network requests without sending
		try {
			await page.exposeFunction("__clineGetNetworkRequests", async () => {
				return this.networkRequests
			})
		} catch {
			// Already exposed
		}

		// Expose function for sending console logs
		try {
			await page.exposeFunction("__clineSendConsoleLogs", async (logs: string[]) => {
				await this.sendElementsToChat([], [], [], [], [], false, logs, [])
			})
		} catch {
			// Already exposed
		}

		// Expose function for sending network requests
		try {
			await page.exposeFunction("__clineSendNetworkRequests", async (requests: string[]) => {
				await this.sendElementsToChat([], [], [], [], [], false, [], requests)
			})
		} catch {
			// Already exposed
		}

		// Expose function for clearing console logs
		try {
			await page.exposeFunction("__clineClearConsoleLogs", async () => {
				this.consoleLogs = []
			})
		} catch {
			// Already exposed
		}

		// Expose function for clearing network requests
		try {
			await page.exposeFunction("__clineClearNetworkRequests", async () => {
				this.networkRequests = []
			})
		} catch {
			// Already exposed
		}

		// Attach listeners for Console (all types, not just errors)
		page.on("console", (msg) => {
			const type = msg.type()
			const text = msg.text()
			const timestamp = new Date().toISOString().substr(11, 12)
			this.consoleLogs.push(`[${timestamp}] [${type.toUpperCase()}] ${text}`)
			if (this.consoleLogs.length > 200) this.consoleLogs.shift()

			if (type === "error") {
				this.capturedErrors.push(`[Console Error] ${text}`)
				if (this.capturedErrors.length > 50) this.capturedErrors.shift()
			}
		})
		page.on("pageerror", (error) => {
			const timestamp = new Date().toISOString().substr(11, 12)
			this.consoleLogs.push(`[${timestamp}] [PAGE ERROR] ${error.message}`)
			if (this.consoleLogs.length > 200) this.consoleLogs.shift()

			this.capturedErrors.push(`[Page Error] ${error.message}`)
			if (this.capturedErrors.length > 50) this.capturedErrors.shift()
		})

		// Attach listeners for Network Requests (all requests, not just failed)
		page.on("request", (request) => {
			const timestamp = new Date().toISOString().substr(11, 12)
			this.networkRequests.push(`[${timestamp}] → ${request.method()} ${request.url()}`)
			if (this.networkRequests.length > 200) this.networkRequests.shift()
		})
		page.on("requestfailed", (request) => {
			const timestamp = new Date().toISOString().substr(11, 12)
			const failureText = request.failure()?.errorText || "Unknown error"
			this.networkRequests.push(`[${timestamp}] ✗ FAILED ${request.method()} ${request.url()} - ${failureText}`)
			if (this.networkRequests.length > 200) this.networkRequests.shift()

			this.failedNetworkRequests.push(`[Request Failed] ${request.method()} ${request.url()} - ${failureText}`)
			if (this.failedNetworkRequests.length > 50) this.failedNetworkRequests.shift()
		})
		page.on("response", (response) => {
			const timestamp = new Date().toISOString().substr(11, 12)
			const status = response.status()
			const statusText = response.ok() ? "✓" : `✗ ${status}`
			this.networkRequests.push(`[${timestamp}] ← ${statusText} ${response.request().method()} ${response.url()}`)
			if (this.networkRequests.length > 200) this.networkRequests.shift()

			if (!response.ok()) {
				this.failedNetworkRequests.push(
					`[Response Error] ${response.request().method()} ${response.url()} - Status: ${status}`,
				)
				if (this.failedNetworkRequests.length > 50) this.failedNetworkRequests.shift()
			}
		})

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
					.cline-btn-record { background:#9C27B0; color:#fff; }
					.cline-btn-record:hover { background:#ab47bc; }
					.cline-btn-record.active { background:#d00000; animation:pulse 1.5s infinite; }
					.cline-btn-design { background:#4CAF50; color:#fff; }
					.cline-btn-design:hover { background:#66bb6a; }
					.cline-btn-design.active { background:#d00000; animation:pulse 1.5s infinite; }
					.cline-btn-send { background:#2196F3; color:#fff; }
					.cline-btn-send:hover { background:#42a5f5; }
					.cline-btn-send:disabled { opacity:0.4; cursor:not-allowed; }
					.cline-btn-clear { background:rgba(255,255,255,0.1); color:#aaa; }
					.cline-btn-clear:hover { background:rgba(255,255,255,0.2); color:#fff; }
					.cline-btn-style { background:#FF9800; color:#fff; }
					.cline-btn-style:hover { background:#FFB74D; }
					.cline-btn-style.active { background:#d00000; animation:pulse 1.5s infinite; }
					.cline-tag {
						display:inline-flex; align-items:center; gap:4px;
						padding:3px 8px; background:rgba(232,93,4,0.2);
						border:1px solid rgba(232,93,4,0.4); border-radius:4px;
						font-size:11px; color:#f48c06;
					}
					.cline-tag.action {
						background:rgba(156,39,176,0.2); border-color:rgba(156,39,176,0.4); color:#e1bee7;
					}
					.cline-tag.design {
						background:rgba(76,175,80,0.2); border-color:rgba(76,175,80,0.4); color:#a5d6a7;
					}
					.cline-tag.style {
						background:rgba(255,152,0,0.2); border-color:rgba(255,152,0,0.4); color:#FFE0B2;
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
					
					/* Advanced Style Editor UI */
					.cline-inspector {
						display: none; position: fixed; right: 20px; top: 20px; width: 320px;
						background: #1e1e2e; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
						box-shadow: 0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,152,0,0.2); 
						z-index: 2147483648; color: #e0e0e0; font-family: -apple-system, sans-serif; font-size: 13px;
						flex-direction: column; max-height: 85vh; 
						backdrop-filter: blur(10px);
						animation: slideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
					}
					@keyframes slideIn { from { opacity: 0; transform: translateY(-10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
					.cline-inspector.active { display: flex; }
					.cline-inspector-header {
						padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.08);
						font-weight: 700; font-size: 14px; display: flex; justify-content: space-between; align-items: center;
						background: rgba(0,0,0,0.2); border-radius: 12px 12px 0 0; color: #fff;
						user-select: none; cursor: move;
					}
					.cline-inspector-header span.close-btn { cursor: pointer; color: #888; font-size: 18px; line-height: 1; transition: color 0.15s; }
					.cline-inspector-header span.close-btn:hover { color: #f44336; }
					.cline-inspector-body { 
						padding: 16px; display: flex; flex-direction: column; gap: 16px; 
						overflow-y: auto; overflow-x: hidden;
					}
					.cline-inspector-body::-webkit-scrollbar { width: 6px; }
					.cline-inspector-body::-webkit-scrollbar-track { background: transparent; }
					.cline-inspector-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
					.cline-inspector-body::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
					.cline-inspector-target { 
						font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; 
						color: #FFB74D; word-break: break-all; font-size: 11px; margin-bottom: 4px; 
						padding: 10px; background: rgba(255,152,0,0.1); border-radius: 6px;
						border: 1px dashed rgba(255,152,0,0.3);
						line-height: 1.4;
					}
					.cline-prop-group { display: flex; flex-direction: column; gap: 8px; }
					.cline-prop-group label { color: #888; font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 700; text-align: right; }
					.cline-prop-row { display: flex; align-items: center; gap: 8px; }
					.cline-prop-row input {
						flex: 1; background: #11111a; border: 1px solid rgba(255,255,255,0.1);
						color: #fff; padding: 8px 10px; border-radius: 6px; font-size: 12px;
						transition: all 0.15s; width: 0; min-width: 0;
					}
					.cline-prop-row input:focus { outline: none; border-color: #FF9800; background: #1a1a2e; box-shadow: 0 0 0 2px rgba(255,152,0,0.2); }
					.cline-prop-row input:hover:not(:focus) { border-color: rgba(255,255,255,0.3); }
					.cline-prop-row input[type="color"] { width: 36px; height: 36px; padding: 2px; cursor: pointer; flex: none; border-radius: 6px; }
					.cline-prop-row input[type="color"]::-webkit-color-swatch-wrapper { padding: 2px; }
					.cline-prop-row input[type="color"]::-webkit-color-swatch { border-radius: 4px; border: none; }
					.cline-prop-row select {
						flex: 1; background: #11111a; border: 1px solid rgba(255,255,255,0.1);
						color: #fff; padding: 8px 10px; border-radius: 6px; font-size: 12px;
						transition: all 0.15s; width: 0; min-width: 0;
						cursor: pointer; appearance: none;
						background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
						background-repeat: no-repeat; background-position: right 8px center;
						padding-right: 28px;
					}
					.cline-prop-row select:focus { outline: none; border-color: #FF9800; background-color: #1a1a2e; box-shadow: 0 0 0 2px rgba(255,152,0,0.2); }
					.cline-prop-row select:hover:not(:focus) { border-color: rgba(255,255,255,0.3); }
					.cline-prop-row select option { background: #1e1e2e; color: #fff; }
					
					.cline-inspector-footer {
						padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.08);
						background: rgba(0,0,0,0.2); border-radius: 0 0 12px 12px;
					}
					.cline-btn-inspector-send {
						width: 100%; padding: 10px; border: none; border-radius: 6px; cursor: pointer;
						font-size: 13px; font-weight: 600; background: linear-gradient(135deg, #FF9800, #F57C00);
						color: #fff; transition: all 0.2s; box-shadow: 0 4px 12px rgba(255,152,0,0.3);
						display: flex; justify-content: center; align-items: center; gap: 6px;
					}
					.cline-btn-inspector-send:hover { background: linear-gradient(135deg, #FFB74D, #FF9800); transform: translateY(-1px); box-shadow: 0 6px 16px rgba(255,152,0,0.4); }
					.cline-btn-inspector-send:active { transform: translateY(1px); box-shadow: 0 2px 8px rgba(255,152,0,0.3); }
					
					/* New buttons */
					.cline-btn-theme { background: #607D8B; color: #fff; }
					.cline-btn-theme:hover { background: #78909C; }
					.cline-btn-theme.active { background: #263238; }
					.cline-btn-screenshot { background: #00BCD4; color: #fff; }
					.cline-btn-screenshot:hover { background: #26C6DA; }
					.cline-btn-console { background: #795548; color: #fff; }
					.cline-btn-console:hover { background: #8D6E63; }
					.cline-btn-console.active { background: #d00000; }
					.cline-btn-network { background: #009688; color: #fff; }
					.cline-btn-network:hover { background: #26A69A; }
					.cline-btn-network.active { background: #d00000; }
					
					/* Console and Network Panels */
					.cline-panel {
						display: none; position: fixed; left: 20px; bottom: 60px; width: 500px; max-height: 400px;
						background: #1e1e2e; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
						box-shadow: 0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,152,0,0.2); 
						z-index: 2147483648; color: #e0e0e0; font-family: ui-monospace, monospace; font-size: 11px;
						flex-direction: column;
						animation: slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
					}
					@keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
					.cline-panel.active { display: flex; }
					.cline-panel-header {
						padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.08);
						font-weight: 700; font-size: 12px; display: flex; justify-content: space-between; align-items: center;
						background: rgba(0,0,0,0.2); border-radius: 12px 12px 0 0; color: #fff;
					}
					.cline-panel-header .close-btn { cursor: pointer; color: #888; font-size: 16px; }
					.cline-panel-header .close-btn:hover { color: #f44336; }
					.cline-panel-body { 
						padding: 8px; overflow-y: auto; overflow-x: hidden; max-height: 340px;
					}
					.cline-panel-body::-webkit-scrollbar { width: 6px; }
					.cline-panel-body::-webkit-scrollbar-track { background: transparent; }
					.cline-panel-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
					.cline-log-entry {
						padding: 4px 8px; border-bottom: 1px solid rgba(255,255,255,0.05);
						white-space: pre-wrap; word-break: break-all; line-height: 1.4;
					}
					.cline-log-entry:last-child { border-bottom: none; }
					.cline-log-entry.error { color: #f44336; background: rgba(244,67,54,0.1); }
					.cline-log-entry.warn { color: #FF9800; background: rgba(255,152,0,0.1); }
					.cline-log-entry.info { color: #2196F3; background: rgba(33,150,243,0.1); }
					.cline-log-entry .timestamp { color: #666; margin-right: 8px; }
					.cline-panel-footer {
						padding: 8px 12px; border-top: 1px solid rgba(255,255,255,0.08);
						display: flex; gap: 8px; justify-content: flex-end;
					}
					.cline-panel-btn {
						padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer;
						font-size: 11px; font-weight: 600; background: rgba(255,255,255,0.1); color: #fff;
						transition: all 0.15s;
					}
					.cline-panel-btn:hover { background: rgba(255,255,255,0.2); }
					.cline-panel-btn.primary { background: #FF9800; }
					.cline-panel-btn.primary:hover { background: #FFB74D; }
					
					/* Add CSS Rule Section */
					.cline-add-rule {
						padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; margin-top: 12px;
					}
					.cline-add-rule-header {
						font-size: 11px; color: #888; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;
					}
					.cline-add-rule textarea {
						width: 100%; height: 80px; background: #11111a; border: 1px solid rgba(255,255,255,0.1);
						color: #fff; padding: 8px; border-radius: 6px; font-family: ui-monospace, monospace;
						font-size: 11px; resize: vertical;
					}
					.cline-add-rule textarea:focus { outline: none; border-color: #FF9800; }
					.cline-add-rule textarea::placeholder { color: #555; }
					.cline-btn-add-rule {
						margin-top: 8px; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer;
						font-size: 11px; font-weight: 600; background: #4CAF50; color: #fff;
					}
					.cline-btn-add-rule:hover { background: #66BB6A; }
					
					/* Apply to Code Button */
					.cline-btn-apply {
						width: 100%; padding: 10px; border: none; border-radius: 6px; cursor: pointer;
						font-size: 13px; font-weight: 600; background: linear-gradient(135deg, #4CAF50, #388E3C);
						color: #fff; transition: all 0.2s; box-shadow: 0 4px 12px rgba(76,175,80,0.3);
						margin-top: 8px; display: flex; justify-content: center; align-items: center; gap: 6px;
					}
					.cline-btn-apply:hover { background: linear-gradient(135deg, #66BB6A, #4CAF50); transform: translateY(-1px); }
				</style>
				<div class="cline-bar" id="bar">
					<div class="cline-left">
						<span class="cline-brand">🎯 Kilo Code</span>
						<button class="cline-btn cline-btn-pick" id="pickBtn">Pick</button>
						<button class="cline-btn cline-btn-record" id="recordBtn">⏺ Record</button>
						<button class="cline-btn cline-btn-design" id="designBtn">🎨 Design</button>
						<button class="cline-btn cline-btn-style" id="styleBtn">💅 Style</button>
						<button class="cline-btn cline-btn-theme" id="themeBtn" title="Toggle Dark/Light Mode">🌓 Theme</button>
						<button class="cline-btn cline-btn-screenshot" id="screenshotBtn" title="Full Page Screenshot">📷 Shot</button>
						<button class="cline-btn cline-btn-console" id="consoleBtn" title="View Console Logs">📋 Logs</button>
						<button class="cline-btn cline-btn-network" id="networkBtn" title="View Network Traffic">🌐 Net</button>
					</div>
					<div class="cline-center" id="tags">
						<span class="cline-count">Click a button to start</span>
					</div>
					<div class="cline-right">
						<button class="cline-btn cline-btn-clear" id="clearBtn" style="display:none">Clear</button>
						<button class="cline-btn cline-btn-send" id="sendBtn" disabled>Send to Chat</button>
					</div>
					<button class="cline-min" id="minBtn" title="Minimize">▾</button>
				</div>
				
				<!-- Style Editor Inspector Overlay -->
				<div class="cline-inspector" id="cssInspector">
					<div class="cline-inspector-header">
						<span class="close-btn" id="inspectorClose" title="Close">✕</span>
						CSS Editor
					</div>
					<div class="cline-inspector-body">
						<div class="cline-inspector-target" id="inspectorTarget">No element selected</div>
						<div class="cline-prop-group">
							<label>Dimensions</label>
							<div class="cline-prop-row">
								<input type="text" id="prop-width" placeholder="Width" title="Width" />
								<input type="text" id="prop-height" placeholder="Height" title="Height" />
							</div>
							<div class="cline-prop-row">
								<input type="text" id="prop-min-width" placeholder="Min W" title="Min Width" />
								<input type="text" id="prop-max-width" placeholder="Max W" title="Max Width" />
							</div>
							<div class="cline-prop-row">
								<input type="text" id="prop-min-height" placeholder="Min H" title="Min Height" />
								<input type="text" id="prop-max-height" placeholder="Max H" title="Max Height" />
							</div>
						</div>
						<div class="cline-prop-group">
							<label>Spacing</label>
							<div class="cline-prop-row">
								<input type="text" id="prop-margin" placeholder="Margin" title="Margin" />
								<input type="text" id="prop-padding" placeholder="Padding" title="Padding" />
							</div>
						</div>
						<div class="cline-prop-group">
							<label>Typography</label>
							<div class="cline-prop-row">
								<input type="text" id="prop-font-size" placeholder="Size" title="Font Size" />
								<select id="prop-font-weight" title="Font Weight">
									<option value="">Weight</option>
									<option value="100">100 (Thin)</option>
									<option value="200">200</option>
									<option value="300">300 (Light)</option>
									<option value="400">400 (Normal)</option>
									<option value="500">500 (Medium)</option>
									<option value="600">600 (Semi)</option>
									<option value="700">700 (Bold)</option>
									<option value="800">800</option>
									<option value="900">900 (Black)</option>
								</select>
							</div>
							<div class="cline-prop-row">
								<input type="text" id="prop-font-family" placeholder="Font Family" title="Font Family" />
							</div>
							<div class="cline-prop-row">
								<input type="text" id="prop-line-height" placeholder="Line Height" title="Line Height" />
								<input type="text" id="prop-letter-spacing" placeholder="Letter Spacing" title="Letter Spacing" />
							</div>
							<div class="cline-prop-row">
								<select id="prop-text-align" title="Text Align">
									<option value="">Align</option>
									<option value="left">left</option>
									<option value="center">center</option>
									<option value="right">right</option>
									<option value="justify">justify</option>
									<option value="start">start</option>
									<option value="end">end</option>
								</select>
								<select id="prop-text-decoration" title="Text Decoration">
									<option value="">Decoration</option>
									<option value="none">none</option>
									<option value="underline">underline</option>
									<option value="overline">overline</option>
									<option value="line-through">line-through</option>
								</select>
							</div>
							<div class="cline-prop-row">
								<select id="prop-text-transform" title="Text Transform">
									<option value="">Transform</option>
									<option value="none">none</option>
									<option value="uppercase">uppercase</option>
									<option value="lowercase">lowercase</option>
									<option value="capitalize">capitalize</option>
								</select>
								<select id="prop-white-space" title="White Space">
									<option value="">White Space</option>
									<option value="normal">normal</option>
									<option value="nowrap">nowrap</option>
									<option value="pre">pre</option>
									<option value="pre-wrap">pre-wrap</option>
									<option value="pre-line">pre-line</option>
									<option value="break-spaces">break-spaces</option>
								</select>
							</div>
						</div>
						<div class="cline-prop-group">
							<label>Colors & Background</label>
							<div class="cline-prop-row" title="Text Color">
								<input type="color" id="prop-color" />
								<input type="text" id="prop-color-text" placeholder="Text Color" />
							</div>
							<div class="cline-prop-row" title="Background Color">
								<input type="color" id="prop-bg" />
								<input type="text" id="prop-bg-text" placeholder="Background" />
							</div>
							<div class="cline-prop-row">
								<input type="text" id="prop-opacity" placeholder="Opacity (0-1)" title="Opacity" />
							</div>
						</div>
						<div class="cline-prop-group">
							<label>Borders & Radius</label>
							<div class="cline-prop-row">
								<input type="text" id="prop-border" placeholder="Border" title="Border" />
								<input type="text" id="prop-radius" placeholder="Radius" title="Border Radius" />
							</div>
							<div class="cline-prop-row">
								<input type="text" id="prop-outline" placeholder="Outline" title="Outline" />
								<input type="text" id="prop-box-shadow" placeholder="Box Shadow" title="Box Shadow" />
							</div>
						</div>
						<div class="cline-prop-group">
							<label>Layout (Flex/Grid)</label>
							<div class="cline-prop-row">
								<select id="prop-display" title="Display">
									<option value="">Display</option>
									<option value="block">block</option>
									<option value="inline">inline</option>
									<option value="inline-block">inline-block</option>
									<option value="flex">flex</option>
									<option value="inline-flex">inline-flex</option>
									<option value="grid">grid</option>
									<option value="inline-grid">inline-grid</option>
									<option value="table">table</option>
									<option value="none">none</option>
									<option value="contents">contents</option>
								</select>
								<input type="text" id="prop-gap" placeholder="Gap" title="Gap" />
							</div>
							<div class="cline-prop-row">
								<select id="prop-flex-direction" title="Flex Direction">
									<option value="">Flex Dir</option>
									<option value="row">row</option>
									<option value="row-reverse">row-reverse</option>
									<option value="column">column</option>
									<option value="column-reverse">column-reverse</option>
								</select>
								<select id="prop-flex-wrap" title="Flex Wrap">
									<option value="">Wrap</option>
									<option value="nowrap">nowrap</option>
									<option value="wrap">wrap</option>
									<option value="wrap-reverse">wrap-reverse</option>
								</select>
							</div>
							<div class="cline-prop-row">
								<select id="prop-justify" title="Justify Content">
									<option value="">Justify</option>
									<option value="flex-start">flex-start</option>
									<option value="flex-end">flex-end</option>
									<option value="center">center</option>
									<option value="space-between">space-between</option>
									<option value="space-around">space-around</option>
									<option value="space-evenly">space-evenly</option>
									<option value="stretch">stretch</option>
								</select>
								<select id="prop-align" title="Align Items">
									<option value="">Align</option>
									<option value="stretch">stretch</option>
									<option value="flex-start">flex-start</option>
									<option value="flex-end">flex-end</option>
									<option value="center">center</option>
									<option value="baseline">baseline</option>
								</select>
							</div>
						</div>
						<div class="cline-prop-group">
							<label>Positioning</label>
							<div class="cline-prop-row">
								<select id="prop-position" title="Position">
									<option value="">Position</option>
									<option value="static">static</option>
									<option value="relative">relative</option>
									<option value="absolute">absolute</option>
									<option value="fixed">fixed</option>
									<option value="sticky">sticky</option>
								</select>
								<input type="text" id="prop-z-index" placeholder="Z-Index" title="Z-Index" />
							</div>
							<div class="cline-prop-row">
								<input type="text" id="prop-top" placeholder="Top" title="Top" />
								<input type="text" id="prop-right" placeholder="Right" title="Right" />
							</div>
							<div class="cline-prop-row">
								<input type="text" id="prop-bottom" placeholder="Bottom" title="Bottom" />
								<input type="text" id="prop-left" placeholder="Left" title="Left" />
							</div>
						</div>
						<div class="cline-prop-group">
							<label>Effects & Misc</label>
							<div class="cline-prop-row">
								<select id="prop-overflow" title="Overflow">
									<option value="">Overflow</option>
									<option value="visible">visible</option>
									<option value="hidden">hidden</option>
									<option value="scroll">scroll</option>
									<option value="auto">auto</option>
									<option value="clip">clip</option>
								</select>
								<select id="prop-cursor" title="Cursor">
									<option value="">Cursor</option>
									<option value="default">default</option>
									<option value="pointer">pointer</option>
									<option value="text">text</option>
									<option value="move">move</option>
									<option value="grab">grab</option>
									<option value="crosshair">crosshair</option>
									<option value="wait">wait</option>
									<option value="not-allowed">not-allowed</option>
									<option value="none">none</option>
									<option value="help">help</option>
								</select>
							</div>
							<div class="cline-prop-row">
								<input type="text" id="prop-transition" placeholder="Transition" title="Transition" />
							</div>
							<div class="cline-prop-row">
								<input type="text" id="prop-transform" placeholder="Transform" title="Transform" />
							</div>
						</div>
						<!-- Add New CSS Rule Section -->
						<div class="cline-add-rule">
							<div class="cline-add-rule-header">Add New CSS Rule</div>
							<textarea id="newCssRule" placeholder="Enter CSS rule, e.g.:&#10;.my-class {&#10;  color: red;&#10;  padding: 10px;&#10;}"></textarea>
							<button class="cline-btn-add-rule" id="addRuleBtn">Add CSS Rule</button>
						</div>
					</div>
					<div class="cline-inspector-footer">
						<button class="cline-btn-inspector-send" id="inspectorSendBtn">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
							Send Styles to Chat
						</button>
						<button class="cline-btn-apply" id="applyToCodeBtn">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
							Apply to Code
						</button>
					</div>
				</div>
				
				<!-- Console Panel -->
				<div class="cline-panel" id="consolePanel">
					<div class="cline-panel-header">
						<span>📋 Console Output</span>
						<span class="close-btn" id="consoleClose">✕</span>
					</div>
					<div class="cline-panel-body" id="consoleBody">
						<div class="cline-log-entry">No console logs captured yet...</div>
					</div>
					<div class="cline-panel-footer">
						<button class="cline-panel-btn" id="consoleClearBtn">Clear</button>
						<button class="cline-panel-btn primary" id="consoleSendBtn">Send to Chat</button>
					</div>
				</div>
				
				<!-- Network Panel -->
				<div class="cline-panel" id="networkPanel">
					<div class="cline-panel-header">
						<span>🌐 Network Traffic</span>
						<span class="close-btn" id="networkClose">✕</span>
					</div>
					<div class="cline-panel-body" id="networkBody">
						<div class="cline-log-entry">No network requests captured yet...</div>
					</div>
					<div class="cline-panel-footer">
						<button class="cline-panel-btn" id="networkClearBtn">Clear</button>
						<button class="cline-panel-btn primary" id="networkSendBtn">Send to Chat</button>
					</div>
				</div>
			`

			document.documentElement.appendChild(root)

			const bar = shadow.getElementById("bar")!
			const pickBtn = shadow.getElementById("pickBtn")!
			const recordBtn = shadow.getElementById("recordBtn")!
			const designBtn = shadow.getElementById("designBtn")!
			const styleBtn = shadow.getElementById("styleBtn")!
			const themeBtn = shadow.getElementById("themeBtn")!
			const screenshotBtn = shadow.getElementById("screenshotBtn")!
			const consoleBtn = shadow.getElementById("consoleBtn")!
			const networkBtn = shadow.getElementById("networkBtn")!
			const sendBtn = shadow.getElementById("sendBtn")! as HTMLButtonElement
			const clearBtn = shadow.getElementById("clearBtn")! as HTMLElement
			const tags = shadow.getElementById("tags")!
			const minBtn = shadow.getElementById("minBtn")!

			// Inspector Elements
			const cssInspector = shadow.getElementById("cssInspector")!
			const inspectorHeader = cssInspector.querySelector(".cline-inspector-header")!
			const inspectorClose = shadow.getElementById("inspectorClose")!
			const inspectorTarget = shadow.getElementById("inspectorTarget")!
			const inspectorSendBtn = shadow.getElementById("inspectorSendBtn")!
			const addRuleBtn = shadow.getElementById("addRuleBtn")!
			const newCssRule = shadow.getElementById("newCssRule")! as HTMLTextAreaElement
			const applyToCodeBtn = shadow.getElementById("applyToCodeBtn")!

			// Console Panel Elements
			const consolePanel = shadow.getElementById("consolePanel")!
			const consoleClose = shadow.getElementById("consoleClose")!
			const consoleBody = shadow.getElementById("consoleBody")!
			const consoleClearBtn = shadow.getElementById("consoleClearBtn")!
			const consoleSendBtn = shadow.getElementById("consoleSendBtn")!

			// Network Panel Elements
			const networkPanel = shadow.getElementById("networkPanel")!
			const networkClose = shadow.getElementById("networkClose")!
			const networkBody = shadow.getElementById("networkBody")!
			const networkClearBtn = shadow.getElementById("networkClearBtn")!
			const networkSendBtn = shadow.getElementById("networkSendBtn")!

			let pickerOn = false
			let recordingOn = false
			let designOn = false
			let stylingOn = false
			let isDarkMode = false
			let currentStylingElement: HTMLElement | null = null
			let addedCssRules: string[] = []

			let selected: Array<{
				selector: string
				xpath: string
				html: string
				tagName: string
				componentName?: string
				sourceFile?: string
			}> = []
			let recordedActions: string[] = []
			let designEdits: Array<{ selector: string; text: string; html: string; timer?: any }> = []
			let styleEdits: Array<{ selector: string; css: string }> = []
			let hovered: HTMLElement | null = null
			let isMin = false

			function saveState() {
				try {
					sessionStorage.setItem(
						"cline_picker_state",
						JSON.stringify({
							selected,
							recordedActions,
							designEdits: designEdits.map((d) => ({ selector: d.selector, text: d.text, html: d.html })),
							styleEdits: styleEdits.map((s) => ({ selector: s.selector, css: s.css })),
							isMin,
							pickerOn,
							recordingOn,
							designOn,
							stylingOn,
							inspectorPos: {
								left: cssInspector.style.left,
								top: cssInspector.style.top,
							},
						}),
					)
				} catch (e) {}
			}

			try {
				const saved = JSON.parse(sessionStorage.getItem("cline_picker_state") || "{}")
				if (saved.selected) selected = saved.selected
				if (saved.recordedActions) recordedActions = saved.recordedActions
				if (saved.designEdits) designEdits = saved.designEdits
				if (saved.styleEdits) styleEdits = saved.styleEdits
				if (saved.isMin) {
					isMin = true
					bar.classList.add("mini")
					minBtn.textContent = "▴ Kilo Code"
				}
				// Restore session toggles
				if (saved.pickerOn) {
					setTimeout(() => pickBtn.click(), 0)
				} else if (saved.recordingOn) {
					setTimeout(() => recordBtn.click(), 0)
				} else if (saved.designOn) {
					setTimeout(() => designBtn.click(), 0)
				} else if (saved.stylingOn) {
					setTimeout(() => styleBtn.click(), 0)
				}
				if (saved.inspectorPos) {
					cssInspector.style.left = saved.inspectorPos.left
					cssInspector.style.top = saved.inspectorPos.top
					if (saved.inspectorPos.left) cssInspector.style.right = "auto"
				}
			} catch (e) {}

			const pickerCSS = document.createElement("style")
			pickerCSS.id = "cline-picker-css"
			pickerCSS.textContent = `
				.cline-hover { outline:3px solid #e85d04 !important; outline-offset:2px !important; cursor:crosshair !important; background-color:rgba(232,93,4,0.08) !important; }
				.cline-selected { outline:3px solid #2196F3 !important; outline-offset:2px !important; background-color:rgba(33,150,243,0.08) !important; }
			`

			// Draggable logic for Inspector
			let isDragging = false
			let startX = 0,
				startY = 0
			let initialLeft = 0,
				initialTop = 0

			inspectorHeader.addEventListener("mousedown", (e: any) => {
				isDragging = true
				startX = e.clientX
				startY = e.clientY
				const rect = cssInspector.getBoundingClientRect()
				initialLeft = rect.left
				initialTop = rect.top
				saveState()
			})

			document.addEventListener("mousemove", (e) => {
				if (!isDragging) return
				const dx = e.clientX - startX
				const dy = e.clientY - startY

				let newLeft = initialLeft + dx
				let newTop = initialTop + dy

				// Keep within bounds
				const rect = cssInspector.getBoundingClientRect()
				newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - rect.width))
				newTop = Math.max(0, Math.min(newTop, window.innerHeight - rect.height))

				cssInspector.style.left = newLeft + "px"
				cssInspector.style.top = newTop + "px"
				cssInspector.style.right = "auto" // Override the initial right:20px
			})

			document.addEventListener("mouseup", () => {
				if (isDragging) {
					isDragging = false
					saveState()
				}
			})

			minBtn.addEventListener("click", () => {
				isMin = !isMin
				bar.classList.toggle("mini", isMin)
				minBtn.textContent = isMin ? "▴ Kilo Code" : "▾"
				saveState()
			})

			pickBtn.addEventListener("click", () => {
				if (recordingOn) recordBtn.click() // Mutual exclusion
				if (designOn) designBtn.click() // Mutual exclusion
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
				saveState()
			})

			recordBtn.addEventListener("click", () => {
				if (pickerOn) pickBtn.click() // Mutual exclusion
				if (designOn) designBtn.click() // Mutual exclusion
				recordingOn = !recordingOn
				recordBtn.classList.toggle("active", recordingOn)
				recordBtn.textContent = recordingOn ? "⏹ Stop Recording" : "⏺ Record Actions"
				if (recordingOn) {
					document.addEventListener("click", onRecordClick, true)
					document.addEventListener("change", onRecordChange, true)
				} else {
					document.removeEventListener("click", onRecordClick, true)
					document.removeEventListener("change", onRecordChange, true)
				}
				saveState()
			})

			designBtn.addEventListener("click", () => {
				if (pickerOn) pickBtn.click()
				if (recordingOn) recordBtn.click()
				if (stylingOn) styleBtn.click() // Mutual exclusion
				designOn = !designOn
				designBtn.classList.toggle("active", designOn)
				designBtn.textContent = designOn ? "⏹ Stop Design Mode" : "🎨 Design Mode"
				if (designOn) {
					document.designMode = "on"
					document.addEventListener("input", onDesignInput, true)
					// Disable links
					document.addEventListener("click", preventLinksInDesign, true)
				} else {
					document.designMode = "off"
					document.removeEventListener("input", onDesignInput, true)
					document.removeEventListener("click", preventLinksInDesign, true)
				}
				saveState()
			})

			function preventLinksInDesign(e: Event) {
				const t = e.target as HTMLElement
				if (!t || root.contains(t) || cssInspector.contains(t)) return
				if (t.tagName.toLowerCase() === "a" || t.closest("a")) {
					e.preventDefault()
				}
			}

			styleBtn.addEventListener("click", () => {
				if (pickerOn) pickBtn.click()
				if (recordingOn) recordBtn.click()
				if (designOn) designBtn.click()
				stylingOn = !stylingOn
				styleBtn.classList.toggle("active", stylingOn)
				styleBtn.textContent = stylingOn ? "⏹ Stop Styling" : "💅 Style Editor"
				if (stylingOn) {
					document.addEventListener("mouseover", onStyleOver, true)
					document.addEventListener("mouseout", onStyleOut, true)
					document.addEventListener("click", onStyleClick, true)
					cssInspector.classList.add("active")
				} else {
					document.removeEventListener("mouseover", onStyleOver, true)
					document.removeEventListener("mouseout", onStyleOut, true)
					document.removeEventListener("click", onStyleClick, true)
					cssInspector.classList.remove("active")
					currentStylingElement = null
					if (hovered) {
						hovered.classList.remove("cline-hover")
						hovered = null
					}
				}
				saveState()
			})

			inspectorClose.addEventListener("click", () => {
				if (stylingOn) styleBtn.click()
			})
			inspectorSendBtn.addEventListener("click", () => {
				sendBtn.click() // Triggers the unified send function
			})

			// Theme Toggle - Toggle dark/light mode
			themeBtn.addEventListener("click", () => {
				isDarkMode = !isDarkMode
				themeBtn.textContent = isDarkMode ? "☀️" : "🌓"
				if (isDarkMode) {
					document.documentElement.style.filter = "invert(1) hue-rotate(180deg)"
					// Exclude images and videos from inversion
					const style = document.createElement("style")
					style.id = "cline-dark-mode-fix"
					style.textContent = `
						img, video, svg, canvas, [style*="background-image"] {
							filter: invert(1) hue-rotate(180deg) !important;
						}
					`
					document.head.appendChild(style)
				} else {
					document.documentElement.style.filter = ""
					const fix = document.getElementById("cline-dark-mode-fix")
					if (fix) fix.remove()
				}
			})

			// Screenshot - Take full page screenshot and send to chat
			screenshotBtn.addEventListener("click", async () => {
				try {
					// Use the exposed function to request screenshot from extension
					;(window as any).__clineRequestScreenshot()
				} catch (e) {
					console.error("Screenshot failed:", e)
				}
			})

			// Console Panel Toggle
			consoleBtn.addEventListener("click", () => {
				consolePanel.classList.toggle("active")
				networkPanel.classList.remove("active")
				updateConsolePanel()
			})
			consoleClose.addEventListener("click", () => {
				consolePanel.classList.remove("active")
			})
			consoleClearBtn.addEventListener("click", () => {
				;(window as any).__clineClearConsoleLogs?.()
				updateConsolePanel()
			})
			consoleSendBtn.addEventListener("click", async () => {
				const logs = await (window as any).__clineGetConsoleLogs?.()
				if (logs) {
					await (window as any).__clineSendConsoleLogs?.(logs)
				}
				consolePanel.classList.remove("active")
			})

			// Network Panel Toggle
			networkBtn.addEventListener("click", () => {
				networkPanel.classList.toggle("active")
				consolePanel.classList.remove("active")
				updateNetworkPanel()
			})
			networkClose.addEventListener("click", () => {
				networkPanel.classList.remove("active")
			})
			networkClearBtn.addEventListener("click", () => {
				;(window as any).__clineClearNetworkRequests?.()
				updateNetworkPanel()
			})
			networkSendBtn.addEventListener("click", async () => {
				const requests = await (window as any).__clineGetNetworkRequests?.()
				if (requests) {
					await (window as any).__clineSendNetworkRequests?.(requests)
				}
				networkPanel.classList.remove("active")
			})

			// Add CSS Rule
			addRuleBtn.addEventListener("click", () => {
				const css = newCssRule.value.trim()
				if (!css) return
				try {
					const style = document.createElement("style")
					style.id = "cline-added-rule-" + Date.now()
					style.textContent = css
					document.head.appendChild(style)
					addedCssRules.push(css)
					newCssRule.value = ""
					refreshUI()
				} catch (e) {
					console.error("Failed to add CSS rule:", e)
				}
			})

			// Apply to Code - Send all changes to AI agent for source file updates
			applyToCodeBtn.addEventListener("click", () => {
				if (styleEdits.length === 0 && addedCssRules.length === 0) {
					return
				}
				;(window as any).__clineSendElements(
					JSON.stringify({
						elements: [],
						actions: [],
						designEdits: [],
						styleEdits: styleEdits.map((s: any) => ({ selector: s.selector, css: s.css })),
						addedCssRules: addedCssRules,
						applyToCode: true,
					}),
				)
				// Clear after sending
				styleEdits = []
				addedCssRules = []
				refreshUI()
			})

			// Console/Network panel update functions
			async function updateConsolePanel() {
				const logs = await (window as any).__clineGetConsoleLogs()
				if (!logs || logs.length === 0) {
					consoleBody.innerHTML = '<div class="cline-log-entry">No console logs captured yet...</div>'
				} else {
					consoleBody.innerHTML = logs
						.map(
							(log: string) =>
								`<div class="cline-log-entry">${log.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`,
						)
						.join("")
				}
			}

			async function updateNetworkPanel() {
				const requests = await (window as any).__clineGetNetworkRequests()
				if (!requests || requests.length === 0) {
					networkBody.innerHTML = '<div class="cline-log-entry">No network requests captured yet...</div>'
				} else {
					networkBody.innerHTML = requests
						.map(
							(req: string) =>
								`<div class="cline-log-entry">${req.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`,
						)
						.join("")
				}
			}

			// Utility: keyboard increment/decrement for numeric inputs
			function handleNumericKeyboard(e: KeyboardEvent, input: HTMLInputElement, prop: string) {
				if (e.key === "ArrowUp" || e.key === "ArrowDown") {
					e.preventDefault()
					const val = input.value
					const match = val.match(/^(-?\\d*\\.?\\d+)(px|%|em|rem|vh|vw|pt)?$/)
					if (match) {
						let num = parseFloat(match[1])
						const unit = match[2] || ""
						const step = e.shiftKey ? 10 : 1
						const newVal = `${Number.isInteger(num) ? num : parseFloat(num.toFixed(2))}${unit}`
						input.value = newVal
						applyStyleToCurrent(prop, newVal)
					}
				}
			}

			// Setup CSS Input Listeners — map CSS prop to input element ID
			const cssPropMap: Record<string, string> = {
				width: "width",
				height: "height",
				"min-width": "min-width",
				"max-width": "max-width",
				"min-height": "min-height",
				"max-height": "max-height",
				margin: "margin",
				padding: "padding",
				"font-size": "font-size",
				"font-weight": "font-weight",
				"font-family": "font-family",
				"line-height": "line-height",
				"letter-spacing": "letter-spacing",
				"text-align": "text-align",
				"text-decoration": "text-decoration",
				"text-transform": "text-transform",
				"white-space": "white-space",
				border: "border",
				"border-radius": "radius",
				outline: "outline",
				"box-shadow": "box-shadow",
				display: "display",
				gap: "gap",
				"flex-direction": "flex-direction",
				"flex-wrap": "flex-wrap",
				"justify-content": "justify",
				"align-items": "align",
				position: "position",
				"z-index": "z-index",
				top: "top",
				right: "right",
				bottom: "bottom",
				left: "left",
				overflow: "overflow",
				cursor: "cursor",
				opacity: "opacity",
				transition: "transition",
				transform: "transform",
			}
			Object.entries(cssPropMap).forEach(([prop, id]) => {
				const el = cssInspector.querySelector(`#prop-${id}`) as HTMLInputElement | HTMLSelectElement
				if (el) {
					const eventName = el.tagName === "SELECT" ? "change" : "input"
					el.addEventListener(eventName, (e) => {
						const val = (e.target as HTMLInputElement | HTMLSelectElement).value
						applyStyleToCurrent(prop, val)
					})
					if (el.tagName === "INPUT") {
						el.addEventListener("keydown", (e) =>
							handleNumericKeyboard(e as KeyboardEvent, el as HTMLInputElement, prop),
						)
					}
				}
			})

			// Color inputs
			const colorTextInputs = ["color-text", "bg-text"]
			const colorTypeInputs = ["color", "bg"]
			colorTextInputs.forEach((id, i) => {
				const textInput = cssInspector.querySelector(`#prop-${id}`) as HTMLInputElement
				const colorInput = cssInspector.querySelector(`#prop-${colorTypeInputs[i]}`) as HTMLInputElement
				const prop = id === "color-text" ? "color" : "background-color"

				if (textInput && colorInput) {
					textInput.addEventListener("input", (e) => {
						const val = (e.target as HTMLInputElement).value
						applyStyleToCurrent(prop, val)
						// attempt to sync color picker if hex
						if (val.startsWith("#") && (val.length === 4 || val.length === 7)) {
							colorInput.value =
								val.length === 4 ? "#" + val[1] + val[1] + val[2] + val[2] + val[3] + val[3] : val
						}
					})
					colorInput.addEventListener("input", (e) => {
						const val = (e.target as HTMLInputElement).value
						applyStyleToCurrent(prop, val)
						textInput.value = val
					})
				}
			})

			function applyStyleToCurrent(prop: string, value: string) {
				if (!currentStylingElement) return // Apply to the actual DOM
				;(currentStylingElement.style as any)[prop] = value

				const sel = cssPath(currentStylingElement)
				let editObj = styleEdits.find((s) => s.selector === sel)
				if (!editObj) {
					editObj = { selector: sel, css: "" }
					styleEdits.push(editObj)
				}

				// Build a fresh CSS string for this element based on inline styles
				editObj.css = currentStylingElement.style.cssText
				refreshUI()
			}

			function onStyleOver(e: Event) {
				const t = e.target as HTMLElement
				if (!t || root.contains(t) || cssInspector.contains(t)) return
				e.preventDefault()
				e.stopPropagation()
				if (t === hovered) return
				if (hovered) hovered.classList.remove("cline-hover")
				t.classList.add("cline-hover")
				hovered = t
			}

			function onStyleOut(e: Event) {
				const t = e.target as HTMLElement
				if (!t || cssInspector.contains(t)) return
				t.classList.remove("cline-hover")
				if (hovered === t) hovered = null
			}

			function onStyleClick(e: Event) {
				const t = e.target as HTMLElement
				if (!t || root.contains(t) || cssInspector.contains(t)) return
				e.preventDefault()
				e.stopPropagation()
				e.stopImmediatePropagation()

				t.classList.remove("cline-hover")
				currentStylingElement = t

				// Get component name safely
				let componentName = ""
				try {
					const fiberKey = Object.keys(t).find((k) => k.startsWith("__reactFiber$"))
					if (fiberKey) {
						let fiber = (t as any)[fiberKey]
						while (fiber) {
							if (fiber.type && typeof fiber.type === "function") {
								componentName = `<${fiber.type.name}>`
								break
							}
							fiber = fiber.return
						}
					}
				} catch (er) {}

				inspectorTarget.textContent = componentName ? `${componentName} ${cssPath(t)}` : cssPath(t)
				populateInspectorInputs(t)
			}

			function populateInspectorInputs(el: HTMLElement) {
				const computed = window.getComputedStyle(el)

				// Helper to gently populate without triggering 'input' events
				const setVal = (id: string, val: string) => {
					const input = cssInspector.querySelector(`#prop-${id}`) as HTMLInputElement
					if (input) input.value = val
				}

				// Dimensions
				setVal("width", computed.width)
				setVal("height", computed.height)
				setVal("min-width", computed.minWidth)
				setVal("max-width", computed.maxWidth)
				setVal("min-height", computed.minHeight)
				setVal("max-height", computed.maxHeight)
				// Spacing
				setVal("margin", computed.margin)
				setVal("padding", computed.padding)
				// Typography
				setVal("font-size", computed.fontSize)
				setVal("font-weight", computed.fontWeight)
				setVal("font-family", computed.fontFamily)
				setVal("line-height", computed.lineHeight)
				setVal("letter-spacing", computed.letterSpacing)
				setVal("text-align", computed.textAlign)
				setVal("text-decoration", computed.textDecoration)
				setVal("text-transform", computed.textTransform)
				setVal("white-space", computed.whiteSpace)
				// Colors
				setVal("color-text", computed.color)
				setVal("bg-text", computed.backgroundColor)
				setVal("opacity", computed.opacity)
				// Borders
				setVal("border", computed.border)
				setVal("radius", computed.borderRadius)
				setVal("outline", computed.outline)
				setVal("box-shadow", computed.boxShadow)
				// Layout
				setVal("display", computed.display)
				setVal("gap", computed.gap)
				setVal("flex-direction", computed.flexDirection)
				setVal("flex-wrap", computed.flexWrap)
				setVal("justify", computed.justifyContent)
				setVal("align", computed.alignItems)
				// Positioning
				setVal("position", computed.position)
				setVal("z-index", computed.zIndex)
				setVal("top", computed.top)
				setVal("right", computed.right)
				setVal("bottom", computed.bottom)
				setVal("left", computed.left)
				// Effects
				setVal("overflow", computed.overflow)
				setVal("cursor", computed.cursor)
				setVal("transition", computed.transition)
				setVal("transform", computed.transform)

				// Try parsing colors to hex for the color pickers
				const rgbToHex = (rgb: string) => {
					const m = rgb.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i)
					if (m) {
						return (
							"#" +
							("0" + parseInt(m[1], 10).toString(16)).slice(-2) +
							("0" + parseInt(m[2], 10).toString(16)).slice(-2) +
							("0" + parseInt(m[3], 10).toString(16)).slice(-2)
						)
					}
					return ""
				}

				const hexColor = rgbToHex(computed.color)
				const hexBg = rgbToHex(computed.backgroundColor)
				if (hexColor) setVal("color", hexColor)
				if (hexBg) setVal("bg", hexBg)
			}

			sendBtn.addEventListener("click", () => {
				if (!selected.length && !recordedActions.length && !designEdits.length && !styleEdits.length) return
				;(window as any).__clineSendElements(
					JSON.stringify({
						elements: selected,
						actions: recordedActions,
						designEdits: designEdits.map((d) => ({ selector: d.selector, text: d.text, html: d.html })),
						styleEdits: styleEdits.map((s) => ({ selector: s.selector, css: s.css })),
					}),
				)
				clearAll()
				if (pickerOn) pickBtn.click()
				if (recordingOn) recordBtn.click()
				if (designOn) designBtn.click()
				if (stylingOn) styleBtn.click()
			})

			clearBtn.addEventListener("click", clearAll)

			function clearAll() {
				document.querySelectorAll(".cline-selected").forEach((el) => el.classList.remove("cline-selected"))
				selected = []
				recordedActions = []
				designEdits = []
				styleEdits = []
				inspectorTarget.textContent = "No element selected"
				cssInspector.querySelectorAll("input").forEach((i: any) => (i.value = ""))
				cssInspector.querySelectorAll("select").forEach((s: any) => (s.selectedIndex = 0))
				currentStylingElement = null
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

				// Extract React Components if available
				let componentName = ""
				let sourceFile = ""
				try {
					const fiberKey = Object.keys(t).find((k) => k.startsWith("__reactFiber$"))
					if (fiberKey) {
						let fiber = (t as any)[fiberKey]
						while (fiber) {
							if (fiber.type && typeof fiber.type === "function") {
								componentName = fiber.type.name || ""
								if (fiber._debugSource) {
									sourceFile = fiber._debugSource.fileName + ":" + fiber._debugSource.lineNumber
								}
								break
							}
							fiber = fiber.return
						}
					}
				} catch (e) {}

				const idx = selected.findIndex((x) => x.selector === sel)
				if (idx >= 0) {
					selected.splice(idx, 1)
					t.classList.remove("cline-selected")
				} else {
					selected.push({ selector: sel, xpath: xp, html, tagName: tag, componentName, sourceFile })
					t.classList.add("cline-selected")
				}
				refreshUI()
			}

			function onRecordClick(e: Event) {
				const t = e.target as HTMLElement
				if (!t || root.contains(t)) return

				// Exclude typing in input fields since that's handled by change event usually
				if (t.tagName.toLowerCase() === "input" && (t as HTMLInputElement).type === "text") return

				const sel = cssPath(t)
				const text = t.textContent?.substring(0, 50).trim().replace(/\n/g, "")
				recordedActions.push(`Clicked element: ${sel} ${text ? `(Text: "${text}")` : ""}`)
				refreshUI()
			}

			function onRecordChange(e: Event) {
				const t = e.target as HTMLElement
				if (!t || root.contains(t)) return
				const sel = cssPath(t)
				let val = (t as HTMLInputElement).value || (t as HTMLInputElement).checked?.toString() || ""
				if (val.length > 100) val = val.substring(0, 100) + "..."
				recordedActions.push(`Changed value on ${sel} to: "${val}"`)
				refreshUI()
			}

			function onDesignInput(e: Event) {
				const t = e.target as HTMLElement
				if (!t || root.contains(t)) return
				const sel = cssPath(t)

				let editObj = designEdits.find((d) => d.selector === sel)
				if (!editObj) {
					editObj = { selector: sel, text: "", html: "" }
					designEdits.push(editObj)
				}

				// Debounce UI refresh and capture
				clearTimeout(editObj.timer)
				editObj.timer = setTimeout(() => {
					if (editObj) {
						editObj.text = t.textContent || ""
						editObj.html = t.outerHTML
					}
					refreshUI()
				}, 500)
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
				saveState()
				if (
					selected.length === 0 &&
					recordedActions.length === 0 &&
					designEdits.length === 0 &&
					styleEdits.length === 0
				) {
					tags.innerHTML =
						'<span class="cline-count">Click "Pick Element", "Record Actions", "Design Mode", or "Style Editor"</span>'
					sendBtn.disabled = true
					sendBtn.textContent = "Send to Chat"
					clearBtn.style.display = "none"
					return
				}

				let tagsHtml = ""
				selected.forEach((x, i) => {
					let lbl = x.selector
					if (lbl.length > 25) lbl = lbl.substring(0, 25) + "..."
					tagsHtml += `<span class="cline-tag">${lbl} <span class="cline-tag-x" data-idx="${i}" data-type="element">&times;</span></span>`
				})

				recordedActions.forEach((x, i) => {
					tagsHtml += `<span class="cline-tag action">Action ${i + 1} <span class="cline-tag-x" data-idx="${i}" data-type="action">&times;</span></span>`
				})

				designEdits.forEach((x, i) => {
					tagsHtml += `<span class="cline-tag design">Edit ${i + 1} <span class="cline-tag-x" data-idx="${i}" data-type="design">&times;</span></span>`
				})

				styleEdits.forEach((x, i) => {
					let lbl = x.selector
					if (lbl.length > 20) lbl = lbl.substring(0, 20) + "..."
					tagsHtml += `<span class="cline-tag style">Style: ${lbl} <span class="cline-tag-x" data-idx="${i}" data-type="style">&times;</span></span>`
				})

				tags.innerHTML = tagsHtml
				sendBtn.disabled = false

				const total = selected.length + recordedActions.length + designEdits.length + styleEdits.length
				sendBtn.textContent = `Send (${total})`
				clearBtn.style.display = "block"

				tags.querySelectorAll(".cline-tag-x").forEach((btn) => {
					btn.addEventListener("click", (e) => {
						const bt = e.target as HTMLElement
						const idx = parseInt(bt.getAttribute("data-idx") || "0", 10)
						const type = bt.getAttribute("data-type")

						if (type === "element") {
							const selObj = selected[idx]
							if (selObj) {
								document.querySelectorAll(".cline-selected").forEach((node) => {
									if (cssPath(node as HTMLElement) === selObj.selector) {
										node.classList.remove("cline-selected")
									}
								})
								selected.splice(idx, 1)
							}
						} else if (type === "action") {
							recordedActions.splice(idx, 1)
						} else if (type === "design") {
							designEdits.splice(idx, 1)
						} else if (type === "style") {
							styleEdits.splice(idx, 1)
						}
						refreshUI()
					})
				})
			}
		}
	}

	/**
	 * Send selected elements to the Kilo Code chat
	 */
	private async sendElementsToChat(
		elements: Array<{
			selector: string
			xpath: string
			html: string
			tagName: string
			componentName?: string
			sourceFile?: string
		}>,
		actions: string[] = [],
		designEdits: Array<{ selector: string; text: string; html: string }> = [],
		styleEdits: Array<{ selector: string; css: string }> = [],
		addedCssRules: string[] = [],
		applyToCode: boolean = false,
		consoleLogs: string[] = [],
		networkRequests: string[] = [],
	): Promise<void> {
		if (
			elements.length === 0 &&
			actions.length === 0 &&
			designEdits.length === 0 &&
			styleEdits.length === 0 &&
			addedCssRules.length === 0 &&
			consoleLogs.length === 0 &&
			networkRequests.length === 0
		)
			return

		let parts: string[] = []

		if (applyToCode) {
			parts.push(
				`### 🎨 Apply to Code Request\nThe user wants these style changes applied to the source code files.`,
			)
		}

		if (elements.length > 0) {
			parts = elements.map((el, i) => {
				let msg = `### Element ${i + 1}: \`<${el.tagName}>\`\n**CSS**: \`${el.selector}\`\n**XPath**: \`${el.xpath}\``
				if (el.componentName) {
					msg += `\n**React Component**: \`<${el.componentName}>\``
				}
				if (el.sourceFile) {
					msg += `\n**Source File**: \`${el.sourceFile}\``
				}
				msg += `\n\n\`\`\`html\n${el.html}\n\`\`\``
				return msg
			})
		}

		if (actions.length > 0) {
			parts.push(`### Recorded Actions:\n` + actions.map((a, i) => `${i + 1}. ${a}`).join("\n"))
		}

		if (designEdits.length > 0) {
			parts.push(
				`### Design Mode Edits:\n` +
					designEdits
						.map((d, i) => {
							return `**Edit ${i + 1} on \`${d.selector}\`**\n**New Text Content:**\n\`\`\`text\n${d.text}\n\`\`\`\n**New HTML Content:**\n\`\`\`html\n${d.html}\n\`\`\``
						})
						.join("\n\n"),
			)
		}

		if (styleEdits.length > 0) {
			parts.push(
				`### Style Editor Edits:\n` +
					styleEdits
						.map((s, i) => {
							return `**Edit ${i + 1} on \`${s.selector}\`**\n**New CSS Properties:**\n\`\`\`css\n${s.css}\n\`\`\``
						})
						.join("\n\n"),
			)
		}

		if (addedCssRules.length > 0) {
			parts.push(
				`### Added CSS Rules:\n` +
					addedCssRules
						.map((rule, i) => {
							return `**Rule ${i + 1}:**\n\`\`\`css\n${rule}\n\`\`\``
						})
						.join("\n\n"),
			)
		}

		if (consoleLogs.length > 0) {
			parts.push(`### Console Output:\n\`\`\`\n` + consoleLogs.join("\n") + `\n\`\`\``)
		}

		if (networkRequests.length > 0) {
			parts.push(`### Network Traffic:\n\`\`\`\n` + networkRequests.join("\n") + `\n\`\`\``)
		}

		const message = `Browser Elements/Actions Selected:\n\n${parts.join("\n\n")}`
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
