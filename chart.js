// Hand-drawn <canvas> charts (Home balance line, Coin candles). No library.
function drawLine(canvas, pts){const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;c.clearRect(0,0,w,h);
  if(!pts||pts.length<2)return;const ys=pts.map(p=>p[1]),lo=Math.min(...ys),hi=Math.max(...ys)||1;
  c.strokeStyle='#2de2e6';c.lineWidth=2;c.beginPath();
  pts.forEach((p,i)=>{const x=i/(pts.length-1)*w,y=h-(p[1]-lo)/((hi-lo)||1)*h;i?c.lineTo(x,y):c.moveTo(x,y)});c.stroke();}
