/* DOCUMENT_TEXT_DETECTION handles printed text and handwriting, without an LLM. */
export function linesFromVision(body){
 const response=body?.responses?.[0];if(!response||response.error)throw Error('Recognition failed. Try a clearer photo later.');
 const pages=response.fullTextAnnotation?.pages;if(!pages)return [];
 const lines=[];
 for(const page of pages)for(const block of page.blocks||[])for(const paragraph of block.paragraphs||[]){
  let text='',confidence=1,known=false;
  const flush=()=>{if(text.trim()){lines.push({text:text.trim(),confidence:known?confidence:null});text='';confidence=1;known=false;}};
  for(const word of paragraph.words||[]){
   if(Number.isFinite(word.confidence)){confidence=Math.min(confidence,word.confidence);known=true;}else{confidence=0;known=true;}
   for(const symbol of word.symbols||[]){
    if(typeof symbol.text==='string')text+=symbol.text;
    const br=symbol.property?.detectedBreak?.type;
    if(['EOL_SURE_SPACE','LINE_BREAK'].includes(br))flush();else if(['SPACE','SURE_SPACE'].includes(br))text+=' ';
   }
  }flush();
 }
 if(lines.length>100||lines.some(l=>l.text.length>2000))throw Error('List is too large. Scan up to 100 short items at a time.');
 return lines;
}
// Only a single resized JPEG is accepted, with dimensions checked before billing.
export function jpegDimensions(bytes){
 if(bytes[0]!==255||bytes[1]!==216)throw Error('Choose a JPEG photo.');
 let i=2;while(i+3<bytes.length){if(bytes[i++]!==255)throw Error('Invalid photo.');while(bytes[i]===255)i++;const marker=bytes[i++];if(marker===0xda||marker===0xd9)break;const len=(bytes[i]<<8)|bytes[i+1];if(len<2||i+len>bytes.length)break;
  if([0xc0,0xc1,0xc2].includes(marker)){if(len<8)break;const height=(bytes[i+3]<<8)|bytes[i+4],width=(bytes[i+5]<<8)|bytes[i+6];if(!width||!height||width>2400||height>2400)throw Error('Resize the photo to at most 2400 pixels per side.');return {width,height};}i+=len;
 }throw Error('Invalid JPEG photo.');
}
export async function limitedText(request,max){const reader=request.body?.getReader();if(!reader)return '';let size=0;const parts=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw Error('Photo request is too large.');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}const out=new Uint8Array(size);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return new TextDecoder().decode(out);}
