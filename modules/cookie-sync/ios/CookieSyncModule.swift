import ExpoModulesCore
import WebKit

public class CookieSyncModule: Module {
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
  }
  
  /// Helper to check if a cookie matches the target domain
  private func cookieMatchesDomain(cookie: HTTPCookie, targetDomain: String) -> Bool {
    let cookieDomain = cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain
    return targetDomain.hasSuffix(cookieDomain) || cookieDomain.hasSuffix(targetDomain)
  }
}
