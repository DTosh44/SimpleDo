const b64=bytes=>btoa(String.fromCharCode(...bytes));
const unb64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export const random=()=>b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export const hash=async value=>b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export async function cipher(keyText,value,context) {
 const key=await crypto.subtle.importKey('raw',unb64(keyText),'AES-GCM',false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(context)},key,new TextEncoder().encode(JSON.stringify(value)));
 return b64(iv)+'.'+b64(new Uint8Array(bytes));
}
export async function decipher(keyText,value,context) {
 const [iv,data]=value.split('.');
 const key=await crypto.subtle.importKey('raw',unb64(keyText),'AES-GCM',false,['decrypt']);
 const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:new TextEncoder().encode(context)},key,unb64(data));
 return JSON.parse(new TextDecoder().decode(bytes));
}
