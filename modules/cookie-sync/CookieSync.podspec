require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'CookieSync'
  s.version        = package['version']
  s.summary        = 'Expo module to sync WKWebView cookies'
  s.description    = 'Native iOS module to extract cookies from WKWebView for Cloudflare bypass'
  s.authors        = { 'drshnk' => 'drshnk@example.com' }
  s.license        = { :type => 'MIT' }
  s.homepage       = 'https://github.com/drshnk/manga-reader'
  s.platform       = :ios, '13.4'
  s.swift_version  = '5.4'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "ios/**/*.{h,m,swift}"
end
