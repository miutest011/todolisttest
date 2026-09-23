// 把应用里打包的网页文件当成一个"网站"提供出去。
//
// 为什么不直接用 file:// 打开 index.html：那样浏览器引擎会把它当成一个没有来源的页面，
// localStorage（待办数据存的地方）不保证能用、也不保证留得住。
// 自定义一个地址（todolist://app/index.html）就有了正经的"来源"，
// 数据和普通网站一样存得住、留得下。

import Foundation
import WebKit

final class WebFilesSchemeHandler: NSObject, WKURLSchemeHandler {

    // 浏览器只认 Content-Type，认不出来的文件（比如 .js）会被当成纯文本不执行
    private static let mimeTypes: [String: String] = [
        "html": "text/html",
        "css": "text/css",
        "js": "text/javascript",
        "json": "application/json",
        "png": "image/png",
        "svg": "image/svg+xml"
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else {
            task.didFailWithError(URLError(.badURL))
            return
        }

        // todolist://app/index.html → index.html。地址栏里的 / 开头要去掉
        var name = url.path
        if name.hasPrefix("/") { name.removeFirst() }
        if name.isEmpty { name = "index.html" }

        // 只认应用包里打包进来的那几个文件。别的一律不给 ——
        // 这样就算网页里有什么地方拼错了地址，也读不到应用之外的东西
        guard let fileURL = Bundle.main.url(forResource: name, withExtension: nil),
              let data = try? Data(contentsOf: fileURL) else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }

        let ext = (name as NSString).pathExtension.lowercased()
        let mime = WebFilesSchemeHandler.mimeTypes[ext] ?? "application/octet-stream"
        let response = URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: "utf-8")

        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    // 加载被取消时会走这里。我们是直接从本地读文件、一次就给完，没有中途可停的活儿
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
    }
}
