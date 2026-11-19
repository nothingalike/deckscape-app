const {build}=require('./package.json');

// Selected explicitly after the recorded distribution prerequisites are resolved.
module.exports={
  ...build,
  directories:{...build.directories,output:'release/signed-candidates'},
  forceCodeSigning:true,
  publish:[],
  win:{...build.win,signExecutable:true},
  mac:{...build.mac,minimumSystemVersion:'13.0',identity:process.env.CSC_NAME,
    hardenedRuntime:true,notarize:true,
    entitlements:'build/entitlements.mac.plist',entitlementsInherit:'build/entitlements.mac.plist'},
  dmg:{sign:true},
};
