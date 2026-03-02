import ExpoModulesCore
import Foundation
import UIKit
import WebKit

public class CookieSyncModule: Module {
  private var activeSolvers: [UUID: CloudflareSolverSession] = [:]

  public func definition() -> ModuleDefinition {
    Name("CookieSync")

    /// Get cookie string for HTTP headers from WKWebView
    AsyncFunction("getCookieString") { (url: String, promise: Promise) in
      DispatchQueue.main.async {
        let cookieStore = WKWebsiteDataStore.default().httpCookieStore
        
        cookieStore.getAllCookies { cookies in
          let targetDomain = URL(string: url)?.host ?? ""
          
          let relevantCookies = cookies.filter { cookie in
            self.cookieMatchesDomain(cookie: cookie, targetDomain: targetDomain)
          }
          
          let cookieString = relevantCookies.map { "\($0.name)=\($0.value)" }.joined(separator: "; ")
          
          print("[CookieSync] Cookie string for \(targetDomain): \(relevantCookies.count) cookies")
          promise.resolve([
            "cookieString": cookieString,
            "count": relevantCookies.count,
            "domain": targetDomain
          ])
        }
      }
    }

    /// Check if cf_clearance cookie exists for a domain
    AsyncFunction("hasCfClearance") { (url: String, promise: Promise) in
      DispatchQueue.main.async {
        let cookieStore = WKWebsiteDataStore.default().httpCookieStore
        
        cookieStore.getAllCookies { cookies in
          let targetDomain = URL(string: url)?.host ?? ""
          
          let cfClearance = cookies.first { cookie in
            cookie.name == "cf_clearance" && self.cookieMatchesDomain(cookie: cookie, targetDomain: targetDomain)
          }
          
          let hasClearance = cfClearance != nil
          print("[CookieSync] cf_clearance for \(targetDomain): \(hasClearance)")
          
          promise.resolve([
            "hasCfClearance": hasClearance,
            "domain": targetDomain,
            "cookieValue": cfClearance?.value ?? ""
          ])
        }
      }
    }

    /// Get all cookies from WKWebView for a domain
    AsyncFunction("getCookiesFromWebView") { (url: String, promise: Promise) in
      DispatchQueue.main.async {
        let cookieStore = WKWebsiteDataStore.default().httpCookieStore
        
        cookieStore.getAllCookies { cookies in
          let targetDomain = URL(string: url)?.host ?? ""
          var cookieList: [[String: Any]] = []
          
          for cookie in cookies {
            if self.cookieMatchesDomain(cookie: cookie, targetDomain: targetDomain) {
              cookieList.append([
                "name": cookie.name,
                "value": cookie.value,
                "domain": cookie.domain,
                "path": cookie.path,
                "isSecure": cookie.isSecure,
                "isHTTPOnly": cookie.isHTTPOnly,
                "expiresDate": cookie.expiresDate?.timeIntervalSince1970 ?? 0
              ])
            }
          }
          
          print("[CookieSync] Found \(cookieList.count) cookies for \(targetDomain)")
          promise.resolve([
            "cookies": cookieList,
            "domain": targetDomain
          ])
        }
      }
    }

    /// Sync cookies from WKWebView to NSHTTPCookieStorage (for URLSession/fetch)
    AsyncFunction("syncCookiesToNative") { (url: String, promise: Promise) in
      DispatchQueue.main.async {
        let cookieStore = WKWebsiteDataStore.default().httpCookieStore
        
        cookieStore.getAllCookies { cookies in
          var syncedCount = 0
          let targetDomain = URL(string: url)?.host ?? ""
          
          for cookie in cookies {
            if self.cookieMatchesDomain(cookie: cookie, targetDomain: targetDomain) {
              HTTPCookieStorage.shared.setCookie(cookie)
              syncedCount += 1
              print("[CookieSync] Synced: \(cookie.name) for \(cookie.domain)")
            }
          }
          
          print("[CookieSync] Synced \(syncedCount) cookies for \(targetDomain)")
          promise.resolve([
            "success": true,
            "syncedCount": syncedCount,
            "domain": targetDomain
          ])
        }
      }
    }

    /// Check if cf_clearance token exists AND is not expired
    AsyncFunction("isCfClearanceValid") { (url: String, promise: Promise) in
      DispatchQueue.main.async {
        let cookieStore = WKWebsiteDataStore.default().httpCookieStore
        
        cookieStore.getAllCookies { cookies in
          let targetDomain = URL(string: url)?.host ?? ""
          
          let cfClearance = cookies.first { cookie in
            cookie.name == "cf_clearance" && self.cookieMatchesDomain(cookie: cookie, targetDomain: targetDomain)
          }
          
          guard let cookie = cfClearance else {
            print("[CookieSync] isCfClearanceValid: No cf_clearance found for \(targetDomain)")
            promise.resolve([
              "isValid": false,
              "exists": false,
              "domain": targetDomain
            ])
            return
          }
          
          // Check expiry - cf_clearance cookies have an expiry date
          let now = Date()
          let isExpired: Bool
          if let expiresDate = cookie.expiresDate {
            isExpired = expiresDate < now
            let remainingSeconds = expiresDate.timeIntervalSince(now)
            print("[CookieSync] cf_clearance expires in \(Int(remainingSeconds))s, expired: \(isExpired)")
          } else {
            // Session cookie - assume valid
            isExpired = false
            print("[CookieSync] cf_clearance is session cookie (no expiry)")
          }
          
          promise.resolve([
            "isValid": !isExpired,
            "exists": true,
            "isExpired": isExpired,
            "expiresDate": cookie.expiresDate?.timeIntervalSince1970 ?? 0,
            "domain": targetDomain
          ])
        }
      }
    }

    /// Clear cf_clearance cookie for a domain (to force fresh challenge)
    AsyncFunction("clearCfClearance") { (url: String, promise: Promise) in
      DispatchQueue.main.async {
        let cookieStore = WKWebsiteDataStore.default().httpCookieStore
        let targetDomain = URL(string: url)?.host ?? ""
        
        cookieStore.getAllCookies { cookies in
          let cfCookies = cookies.filter { cookie in
            cookie.name == "cf_clearance" && self.cookieMatchesDomain(cookie: cookie, targetDomain: targetDomain)
          }
          
          if cfCookies.isEmpty {
            print("[CookieSync] clearCfClearance: No cf_clearance to clear for \(targetDomain)")
            promise.resolve([
              "success": true,
              "cleared": 0,
              "domain": targetDomain
            ])
            return
          }
          
          var clearedCount = 0
          let group = DispatchGroup()
          
          for cookie in cfCookies {
            group.enter()
            cookieStore.delete(cookie) {
              clearedCount += 1
              print("[CookieSync] Cleared cf_clearance for \(cookie.domain)")
              group.leave()
            }
            // Also clear from HTTPCookieStorage
            HTTPCookieStorage.shared.deleteCookie(cookie)
          }
          
          group.notify(queue: .main) {
            promise.resolve([
              "success": true,
              "cleared": clearedCount,
              "domain": targetDomain
            ])
          }
        }
      }
    }

    /// Solve a Cloudflare challenge using an off-screen native WKWebView.
    AsyncFunction("solveCloudflareChallenge") {
      (
        url: String,
        userAgent: String?,
        headers: [String: String]?,
        timeoutMs: Double,
        promise: Promise
      ) in
      DispatchQueue.main.async {
        let sessionId = UUID()
        let session = CloudflareSolverSession(
          url: url,
          userAgent: userAgent,
          headers: headers ?? [:],
          timeoutMs: timeoutMs,
          onFinish: { [weak self] result in
            self?.activeSolvers.removeValue(forKey: sessionId)
            promise.resolve(result)
          }
        )

        self.activeSolvers[sessionId] = session
        session.start()
      }
    }
  }
  
  /// Helper to check if a cookie matches the target domain
  private func cookieMatchesDomain(cookie: HTTPCookie, targetDomain: String) -> Bool {
    let cookieDomain = cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain
    return targetDomain.hasSuffix(cookieDomain) || cookieDomain.hasSuffix(targetDomain)
  }
}

private final class CloudflareSolverSession: NSObject, WKNavigationDelegate {
  private let url: String
  private let userAgent: String?
  private let headers: [String: String]
  private let timeoutMs: Double
  private let onFinish: ([String: Any]) -> Void
  private let cookieStore = WKWebsiteDataStore.default().httpCookieStore

  private var webView: WKWebView?
  private var finished = false
  private var startTime = Date()
  private var originalCookieValue: String?

  init(
    url: String,
    userAgent: String?,
    headers: [String: String],
    timeoutMs: Double,
    onFinish: @escaping ([String: Any]) -> Void
  ) {
    self.url = url
    self.userAgent = userAgent
    self.headers = headers
    self.timeoutMs = timeoutMs
    self.onFinish = onFinish
    super.init()
  }

  func start() {
    guard let requestUrl = URL(string: url) else {
      finish(success: false, reason: "invalid_url")
      return
    }

    let targetDomain = requestUrl.host ?? ""

    cookieStore.getAllCookies { [weak self] cookies in
      guard let self else { return }

      self.originalCookieValue = cookies.first {
        $0.name == "cf_clearance" && self.cookieMatchesDomain(cookie: $0, targetDomain: targetDomain)
      }?.value

      let configuration = WKWebViewConfiguration()
      configuration.websiteDataStore = .default()
      configuration.defaultWebpagePreferences.allowsContentJavaScript = true

      let webView = WKWebView(
        frame: CGRect(x: -10000, y: -10000, width: 1, height: 1),
        configuration: configuration
      )
      webView.navigationDelegate = self
      webView.isOpaque = false
      webView.backgroundColor = .clear
      webView.scrollView.isScrollEnabled = false

      if let userAgent = self.userAgent, !userAgent.isEmpty {
        webView.customUserAgent = userAgent
      }

      if let containerView = Self.findRootView() {
        containerView.addSubview(webView)
      }

      self.webView = webView
      self.startTime = Date()

      var request = URLRequest(url: requestUrl)
      self.headers.forEach { key, value in
        request.setValue(value, forHTTPHeaderField: key)
      }

      webView.load(request)
      self.pollForClearance()
    }
  }

  private func pollForClearance() {
    guard !finished else { return }

    let targetDomain = URL(string: url)?.host ?? ""
    cookieStore.getAllCookies { [weak self] cookies in
      guard let self, !self.finished else { return }

      let cfCookie = cookies.first {
        $0.name == "cf_clearance" && self.cookieMatchesDomain(cookie: $0, targetDomain: targetDomain)
      }

      if let cfCookie, !cfCookie.value.isEmpty, cfCookie.value != self.originalCookieValue {
        self.finish(success: true, reason: nil)
        return
      }

      let elapsedMs = Date().timeIntervalSince(self.startTime) * 1000
      if elapsedMs >= self.timeoutMs {
        self.finish(success: false, reason: "timeout")
        return
      }

      DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
        self?.pollForClearance()
      }
    }
  }

  private func finish(success: Bool, reason: String?) {
    guard !finished else { return }
    finished = true

    webView?.stopLoading()
    webView?.navigationDelegate = nil
    webView?.removeFromSuperview()
    webView = nil

    var result: [String: Any] = ["success": success]
    if let reason {
      result["reason"] = reason
    }
    onFinish(result)
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    finish(success: false, reason: error.localizedDescription)
  }

  func webView(
    _ webView: WKWebView,
    didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    finish(success: false, reason: error.localizedDescription)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    pollForClearance()
  }

  private func cookieMatchesDomain(cookie: HTTPCookie, targetDomain: String) -> Bool {
    let cookieDomain = cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain
    return targetDomain.hasSuffix(cookieDomain) || cookieDomain.hasSuffix(targetDomain)
  }

  private static func findRootView() -> UIView? {
    return UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first(where: { $0.isKeyWindow })?
      .rootViewController?
      .view
  }
}
