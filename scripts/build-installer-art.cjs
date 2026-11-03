const fs=require('fs'),path=require('path'),{createCanvas,loadImage}=require('@napi-rs/canvas');
const dir=path.resolve(__dirname,'../Assets/installer');fs.mkdirSync(dir,{recursive:true});
function bmp(name,w,h,draw){
 const c=createCanvas(w,h),x=c.getContext('2d');draw(x,w,h);
 const rgba=x.getImageData(0,0,w,h).data,row=Math.ceil(w*3/4)*4,bytes=Buffer.alloc(54+row*h);
 bytes.write('BM');bytes.writeUInt32LE(bytes.length,2);bytes.writeUInt32LE(54,10);bytes.writeUInt32LE(40,14);bytes.writeInt32LE(w,18);bytes.writeInt32LE(h,22);bytes.writeUInt16LE(1,26);bytes.writeUInt16LE(24,28);bytes.writeUInt32LE(row*h,34);
 for(let y=0;y<h;y++)for(let col=0;col<w;col++){const i=(y*w+col)*4,o=54+(h-1-y)*row+col*3;bytes[o]=rgba[i+2];bytes[o+1]=rgba[i+1];bytes[o+2]=rgba[i];}
 fs.writeFileSync(path.join(dir,name+'.bmp'),bytes);fs.writeFileSync(path.join(dir,name+'.png'),c.toBuffer('image/png'));
}
(async()=>{
 const logo=await loadImage(path.join(dir,'symbol.png'));
 bmp('sidebar',164,314,(x,w,h)=>{
  x.fillStyle='#000000';x.fillRect(0,0,w,h);
  x.drawImage(logo,48,86,68,68);
  x.fillStyle='#ffffff';x.textAlign='center';x.font='bold 32px Segoe UI';x.fillText('Brown',w/2,187);
 });
 bmp('header',150,57,x=>{x.fillStyle='#ffffff';x.fillRect(0,0,150,57);x.drawImage(logo,15,14,29,29);x.fillStyle='#000000';x.font='bold 23px Segoe UI';x.fillText('Brown',51,37);});
 console.log('Installer artwork written to '+dir);
})().catch(error=>{console.error(error);process.exitCode=1;});
