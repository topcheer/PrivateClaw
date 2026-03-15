Pod::Spec.new do |s|
  s.name             = 'privateclaw_local_notifications'
  s.version          = '0.0.1'
  s.summary          = 'PrivateClaw local notifications bridge'
  s.description      = 'PrivateClaw local notifications bridge.'
  s.homepage         = 'https://privateclaw.us'
  s.license          = { :type => 'MIT', :text => 'MIT' }
  s.author           = { 'GG AI Studio' => 'support@privateclaw.us' }
  s.source           = { :path => '.' }
  s.source_files     = 'Classes/**/*'
  s.dependency 'Flutter'
  s.platform         = :ios, '13.0'
  s.swift_version    = '5.0'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
