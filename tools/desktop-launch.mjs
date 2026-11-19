import {_electron as electron} from '@playwright/test';

/** The driver must preserve the shipped Chromium sandbox on Linux. */
export function desktopArguments(args=[],env=process.env){
  if(args.some(value=>value==='--no-sandbox'||value.startsWith('--no-sandbox=')))throw new Error('Sandbox-disabled launches cannot qualify this app.');
  const display=env.NEUROSCAPE_DISPLAY;
  if(display&&!['x11','wayland'].includes(display))throw new Error('NEUROSCAPE_DISPLAY must be x11 or wayland.');
  return process.platform==='linux'&&display?[...args,'--ozone-platform='+display]:args;
}
export function launchDesktop(options){return electron.launch({...options,args:desktopArguments(options.args,options.env),chromiumSandbox:true});}
