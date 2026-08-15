// Pruebas de la aritmética de quincenas de src/screens/Nomina.tsx.
// Correr con: node scripts/test-quincenas.mjs
//
// Existe porque este cálculo falla en silencio: la primera versión usaba un
// "sondeo" de +40 días desde el día 16 y se saltaba la primera quincena del
// mes siguiente completa. En la UI se ve como un botón ‹ › que a veces brinca
// un periodo — nadie lo nota hasta que falta una nómina.
// Si cambias quincenaOf o shiftQuincena en Nomina.tsx, cópialas aquí y corre.

const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
function quincenaOf(base){
  const y=base.getFullYear(), m=base.getMonth()
  if(base.getDate()<=15) return {start:iso(new Date(y,m,1)), end:iso(new Date(y,m,15))}
  return {start:iso(new Date(y,m,16)), end:iso(new Date(y,m+1,0))}
}
function shiftQuincena(start,dir){
  const d=new Date(start+'T00:00:00')
  const y=d.getFullYear(), m=d.getMonth(), primera=d.getDate()<=15
  if(dir===1) return primera
    ? {start:iso(new Date(y,m,16)),   end:iso(new Date(y,m+1,0))}
    : {start:iso(new Date(y,m+1,1)),  end:iso(new Date(y,m+1,15))}
  return primera
    ? {start:iso(new Date(y,m-1,16)), end:iso(new Date(y,m,0))}
    : {start:iso(new Date(y,m,1)),    end:iso(new Date(y,m,15))}
}
let fails=0
const eq=(got,exp,msg)=>{const g=JSON.stringify(got),e=JSON.stringify(exp);if(g!==e){console.log('FALLA',msg,'\n  got',g,'\n  exp',e);fails++}}

eq(quincenaOf(new Date(2026,1,3)),  {start:'2026-02-01',end:'2026-02-15'}, 'feb 1a')
eq(quincenaOf(new Date(2026,1,20)), {start:'2026-02-16',end:'2026-02-28'}, 'feb 2a (28d)')
eq(quincenaOf(new Date(2024,1,20)), {start:'2024-02-16',end:'2024-02-29'}, 'feb bisiesto')
eq(quincenaOf(new Date(2026,11,31)),{start:'2026-12-16',end:'2026-12-31'}, 'dic 2a')
eq(quincenaOf(new Date(2026,0,15)), {start:'2026-01-01',end:'2026-01-15'}, 'borde 15')
eq(quincenaOf(new Date(2026,0,16)), {start:'2026-01-16',end:'2026-01-31'}, 'borde 16')

// secuencia completa esperada de 2026
const esperadas=[]; for(let m=0;m<13;m++) esperadas.push(iso(new Date(2026,m,1)),iso(new Date(2026,m,16)))
let q=quincenaOf(new Date(2026,0,5)), ida=[]
for(let i=0;i<26;i++){ida.push(q.start);q=shiftQuincena(q.start,1)}
eq(ida, esperadas.slice(0,26), '26 hacia adelante')

let r={start:esperadas[25]}, atras=[]
for(let i=0;i<26;i++){atras.push(r.start);r=shiftQuincena(r.start,-1)}
eq(atras, esperadas.slice(0,26).reverse(), '26 hacia atrás')

// ida y vuelta en cada borde, incluyendo cruces de año
for(let y of [2024,2026]) for(let m=0;m<12;m++) for(const d of [1,16]){
  const s=iso(new Date(y,m,d))
  eq(shiftQuincena(shiftQuincena(s,1).start,-1).start, s, `ida-vuelta ${s}`)
  eq(shiftQuincena(shiftQuincena(s,-1).start,1).start, s, `vuelta-ida ${s}`)
}
// el fin siempre es el último día real del mes en las segundas quincenas
for(let m=0;m<12;m++){
  const q=quincenaOf(new Date(2026,m,20))
  eq(q.end, iso(new Date(2026,m+1,0)), `fin de mes ${m+1}`)
}
console.log(fails? `\n${fails} FALLAS` : '✓ todas las pruebas pasan')
