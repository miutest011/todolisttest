// 应用的唯一一屏：一块占满屏幕的网页视图，里面跑的就是 index.html 那套东西。
//
// 它只负责三件网页干不了的事（网页那边怎么用见 native.js）：
//   reminders —— 把提醒交给系统排
//   export    —— 用系统的"分享"把导出的文件存走
//   import    —— 弹出系统的文件选择，把选中文件的内容交回网页

import UIKit
import WebKit
import UniformTypeIdentifiers

final class WebAppViewController: UIViewController {

    private var webView: WKWebView!
    private let messageName = "todolist"

    override func viewDidLoad() {
        super.viewDidLoad()

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(WebFilesSchemeHandler(), forURLScheme: "todolist")
        config.userContentController.add(self, name: messageName)
        // 视频、录音的预览不要自己弹全屏播放器，就在页面里放
        config.allowsInlineMediaPlayback = true

        webView = WKWebView(frame: .zero, configuration: config)
        // 网页里的 confirm() 要靠下面的 WKUIDelegate 接住。不接的话它不弹窗、直接返回"取消"，
        // 表现就是"点了没反应"——删清单、删打卡、导入数据这些都会静悄悄失败（真踩过）
        webView.uiDelegate = self
        webView.scrollView.bounces = false          // 整页不回弹：里面的列表自己会滚，见 style.css 的 .page
        webView.scrollView.contentInsetAdjustmentBehavior = .never   // 刘海和底部横条由网页自己让位（env(safe-area-inset-*)）
        webView.isOpaque = false
        #if DEBUG
        // 让 Mac 上的 Safari 能连进来看这块网页（Safari → 开发 → 模拟器/你的手机）。
        // 出问题时能直接看控制台报错，比猜快得多
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif

        view.backgroundColor = .white
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])

        webView.load(URLRequest(url: URL(string: "todolist://app/index.html")!))
    }

    // 网页那边在等这个回调（native.js 里的 window.nativeFileChosen）。
    // 传 nil 表示用户取消了
    private func giveFileBackToWebPage(_ text: String?) {
        let argument: String
        if let text = text, let data = try? JSONSerialization.data(withJSONObject: [text]),
           let json = String(data: data, encoding: .utf8) {
            argument = String(json.dropFirst().dropLast())     // 借 JSON 的引号转义，内容里有引号、换行也不会出错
        } else {
            argument = "undefined"
        }
        webView.evaluateJavaScript("window.nativeFileChosen && window.nativeFileChosen(\(argument))")
    }
}

// MARK: - 收网页发来的消息
extension WebAppViewController: WKScriptMessageHandler {

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let payload = message.body as? [String: Any], let type = payload["type"] as? String else { return }

        switch type {
        case "reminders":
            ReminderCenter.replaceAll(with: ReminderCenter.parse(payload["list"]))

        case "export":
            let filename = payload["filename"] as? String ?? "待办清单.json"
            let text = payload["text"] as? String ?? ""
            shareExportedFile(named: filename, text: text)

        case "import":
            pickFileForImport()

        default:
            break
        }
    }

    // 导出：先写进临时目录，再交给系统的分享面板（存到"文件"、发给自己都行）
    private func shareExportedFile(named filename: String, text: String) {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        do {
            try text.write(to: url, atomically: true, encoding: .utf8)
        } catch {
            return
        }

        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        // iPad 上分享面板必须说清楚从哪里弹出来，否则会崩
        sheet.popoverPresentationController?.sourceView = view
        sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
        present(sheet, animated: true)
    }

    private func pickFileForImport() {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.json], asCopy: true)
        picker.delegate = self
        present(picker, animated: true)
    }
}

// MARK: - 系统的文件选择选完了
extension WebAppViewController: UIDocumentPickerDelegate {

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first, let text = try? String(contentsOf: url, encoding: .utf8) else {
            giveFileBackToWebPage(nil)
            return
        }
        giveFileBackToWebPage(text)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        giveFileBackToWebPage(nil)
    }
}

// MARK: - 网页要弹窗时（confirm / alert / prompt）
// 系统不会自动帮我们弹，必须自己接。网页那边用的是 confirm：删清单、删打卡记录、导入数据前都要问一句
extension WebAppViewController: WKUIDelegate {

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "好", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        // 这些问句问的都是"要不要删 / 要不要覆盖"，所以"确定"用红色，别让人手滑
        alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "确定", style: .destructive) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { field in field.text = defaultText }
        alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "好", style: .default) { [weak alert] _ in
            completionHandler(alert?.textFields?.first?.text)
        })
        present(alert, animated: true)
    }
}
