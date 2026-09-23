// Xcode 新建工程时会自动生成一个 ContentView.swift（里面是"Hello, world!"），
// 把那个文件的全部内容换成这一份就行，别的生成文件都不用动。
//
// 这一屏做的事：占满屏幕显示网页那一套，顺便在打开时问一次"允许通知吗"——
// 不答应的话提醒响不了，做成应用也就失去意义了。

import SwiftUI
import UserNotifications

struct ContentView: View {
    var body: some View {
        WebAppScreen()
            // 网页自己会给刘海和底部横条让位（style.css 里的 env(safe-area-inset-*)），
            // 所以这里让它铺满整个屏幕，别让 SwiftUI 再让一次
            .ignoresSafeArea()
            .onAppear {
                UNUserNotificationCenter.current().delegate = NotificationPresenter.shared
                ReminderCenter.requestPermission()
            }
    }
}

// 把上面那个用 UIKit 写的网页控制器接进 SwiftUI。
// 为什么网页那部分不用 SwiftUI 写：要用的 WKWebView、分享面板、文件选择都是 UIKit 的东西，
// 硬包一层只会多一层看不懂的代码
struct WebAppScreen: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> WebAppViewController {
        WebAppViewController()
    }

    func updateUIViewController(_ controller: WebAppViewController, context: Context) {
    }
}

// 默认情况下，应用正开着的时候系统不弹通知。
// 但用户设的就是"这个点提醒我"，开着也该看得见，所以这里让它照常弹
final class NotificationPresenter: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationPresenter()

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }
}
