source 'https://rubygems.org'

# You may use http://rbenv.org/ or https://rvm.io/ to install and use this version
ruby ">= 2.6.10"

# 2026-05-18: bumped cocoapods to 1.16+ for Ruby 3.4 compatibility (1.15.2
# crashes with `cannot load such file -- kconv` on Ruby 3.0+). The
# matching xcodeproj 1.27+ is required by cocoapods 1.16. concurrent-ruby
# constraint also lifted — its old < 1.3.4 pin was tied to activesupport
# 7.0 which no longer applies.
gem 'cocoapods', '>= 1.16.2'
gem 'activesupport', '>= 6.1.7.5', '!= 7.1.0'

# Ruby 3.4.0 has removed some libraries from the standard library.
gem 'bigdecimal'
gem 'logger'
gem 'benchmark'
gem 'mutex_m'
# 2026-05-18: kconv was removed from Ruby stdlib in 3.4 — moved to the
# `nkf` gem. CFPropertyList (transitively pulled by cocoapods → xcodeproj
# → plist serialization) still requires 'kconv'. Without nkf in the
# bundle, pod install crashes with "cannot load such file -- kconv".
gem 'nkf'
