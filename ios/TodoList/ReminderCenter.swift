// 提醒：网页把"什么时候弹什么"整张单子交过来，这里翻译成 iOS 的本地通知。
//
// 这是做成应用的唯一理由 —— 系统排好的通知，app 关着、手机锁着也会响；
// 网页版做不到这件事（浏览器不给网页在后台跑）。

import Foundation
import UserNotifications

enum ReminderCenter {

    // 网页交过来的一条提醒
    struct Reminder: Decodable {
        let fireAt: String      // ISO 时间，例如 2026-09-23T10:00:00.000Z
        let title: String
        let body: String
    }

    private static let identifierPrefix = "todo-"

    static func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    // 整张单子换一遍：先把之前排的全撤掉，再按新单子排。
    // 为什么不做"只改动了的那几条"：任务可以改名、改时间、被删、被归档，
    // 一条条对账的代码又难写又容易错，而全部重排本来就很快
    static func replaceAll(with reminders: [Reminder]) {
        let center = UNUserNotificationCenter.current()
        center.removeAllPendingNotificationRequests()

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        for (index, reminder) in reminders.enumerated() {
            guard let date = formatter.date(from: reminder.fireAt), date > Date() else { continue }

            let content = UNMutableNotificationContent()
            content.title = reminder.title
            content.body = reminder.body
            content.sound = .default

            let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
            let request = UNNotificationRequest(
                identifier: identifierPrefix + String(index),
                content: content,
                trigger: UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
            )
            center.add(request)
        }
    }

    // 网页发过来的是 JSON 里的一段，先翻成 Reminder 数组
    static func parse(_ list: Any?) -> [Reminder] {
        guard let list = list,
              let data = try? JSONSerialization.data(withJSONObject: list),
              let reminders = try? JSONDecoder().decode([Reminder].self, from: data) else {
            return []
        }
        return reminders
    }
}
