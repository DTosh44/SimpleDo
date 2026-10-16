/* Provider adapters return only identifiers/labels or UTC busy intervals, never event details. */
export const SCOPES = {
  outlook:'offline_access https://graph.microsoft.com/Calendars.ReadBasic',
  google:'https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.freebusy'
};
export function providerConfig(provider,env) {
  if(!['outlook','google'].includes(provider))throw Error('Unsupported calendar provider.');
  const prefix=provider==='outlook'?'OUTLOOK':'GOOGLE';
  const clientId=env(prefix+'_CLIENT_ID'),clientSecret=env(prefix+'_CLIENT_SECRET');
  if(!clientId||!clientSecret)throw Error('This calendar provider has not been configured.');
  return {clientId,clientSecret,authorize:provider==='outlook'?'https://login.microsoftonline.com/common/oauth2/v2.0/authorize':'https://accounts.google.com/o/oauth2/v2/auth',
    token:provider==='outlook'?'https://login.microsoftonline.com/common/oauth2/v2.0/token':'https://oauth2.googleapis.com/token'};
}
export async function jsonFetch(url,options={},fetcher=fetch) {
  const response=await fetcher(url,{...options,signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(response.status===401||response.status===400?'Reconnect this calendar in Settings.':'Calendar provider unavailable. Try again later.');
  return response.json();
}
export async function exchange(provider,params,env,fetcher=fetch) {
  const config=providerConfig(provider,env);
  const data=await jsonFetch(config.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,...params})},fetcher);
  if(!data.access_token)throw Error('Reconnect this calendar in Settings.');
  return {access:data.access_token,refresh:data.refresh_token,expires:Date.now()+Number(data.expires_in||3600)*1000};
}
async function graphPages(url,token,fetcher) {
  const rows=[];
  for(let page=0;url;page++) {
    if(page>=100 || !url.startsWith('https://graph.microsoft.com/v1.0/'))throw Error('Calendar response is too large or invalid.');
    const data=await jsonFetch(url,{headers:{Authorization:'Bearer '+token,Prefer:'outlook.timezone="UTC"'}},fetcher);
    if(!Array.isArray(data.value))throw Error('Calendar response is incomplete.');
    rows.push(...data.value);url=data['@odata.nextLink'];
  }
  return rows;
}
export async function listCalendars(provider,token,fetcher=fetch) {
  if(provider==='outlook')return (await graphPages('https://graph.microsoft.com/v1.0/me/calendars?$select=id,name&$top=100',token,fetcher)).map(c=>({id:c.id,name:c.name}));
  const rows=[];let next='',pages=0;
  do {
    if(++pages>100)throw Error('Calendar response is too large.');
    const url=new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList');url.searchParams.set('maxResults','250');if(next)url.searchParams.set('pageToken',next);
    const data=await jsonFetch(url,{headers:{Authorization:'Bearer '+token}},fetcher);
    if(!Array.isArray(data.items))throw Error('Calendar response is incomplete.');
    rows.push(...data.items.filter(c=>!c.deleted).map(c=>({id:c.id,name:c.summaryOverride||c.summary||'Calendar'})));
    next=data.nextPageToken||'';if(rows.length>10000)throw Error('Too many calendars.');
  }while(next);
  return rows;
}
export function outlookBusy(events) {
  const utc=value=>{
    if(!value||value.timeZone!=='UTC')throw Error('Calendar returned an unexpected time zone.');
    const time=value.dateTime;const parsed=Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(time)?time:time+'Z');
    if(!Number.isFinite(parsed))throw Error('Calendar returned an invalid date.');return new Date(parsed).toISOString();
  };
  return events.filter(e=>!e.isCancelled && e.showAs!=='free' && e.showAs!=='workingElsewhere').map(e=>({start:utc(e.start),end:utc(e.end)}));
}
export async function readBusy(provider,token,selected,start,end,fetcher=fetch) {
  if(!selected.length)return [];
  if(provider==='outlook') {
    const result=[];
    for(const calendar of selected) {
      const url=new URL('https://graph.microsoft.com/v1.0/me/calendars/'+encodeURIComponent(calendar)+'/calendarView');
      url.searchParams.set('startDateTime',start);url.searchParams.set('endDateTime',end);url.searchParams.set('$select','start,end,showAs,isCancelled');url.searchParams.set('$top','1000');
      result.push(...outlookBusy(await graphPages(url.href,token,fetcher)));
    }
    return result;
  }
  const data=await jsonFetch('https://www.googleapis.com/calendar/v3/freeBusy',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({timeMin:start,timeMax:end,timeZone:'UTC',items:selected.map(id=>({id}))})},fetcher);
  return selected.flatMap(id=>{
    const calendar=data.calendars?.[id];
    if(!calendar||calendar.errors?.length||!Array.isArray(calendar.busy))throw Error('Some calendars could not be read. Check your calendar selection.');
    return calendar.busy.map(({start,end})=>({start,end}));
  });
}
export function mergeBusy(intervals) {
  const result=[];
  for(const interval of intervals.map(x=>[Date.parse(x.start),Date.parse(x.end)]).sort((a,b)=>a[0]-b[0])) {
    if(!interval.every(Number.isFinite)||interval[1]<=interval[0])throw Error('Calendar returned an invalid busy interval.');
    const last=result[result.length-1];if(last&&interval[0]<=last[1])last[1]=Math.max(last[1],interval[1]);else result.push(interval);
  }
  return result.map(([start,end])=>({start:new Date(start).toISOString(),end:new Date(end).toISOString()}));
}
