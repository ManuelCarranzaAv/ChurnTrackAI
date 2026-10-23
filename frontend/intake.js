'use strict';
// Validate against the same server contract before starting the analysis.
const intakePreview=document.createElement('section');
intakePreview.id='intake-preview';intakePreview.className='intake-preview';
intakePreview.setAttribute('aria-live','polite');intakePreview.hidden=true;
$('csv-form').querySelector('button[type="submit"],button').before(intakePreview);
let intakeVersion=0;
$('csv-file').addEventListener('change',async()=>{
 const version=++intakeVersion,file=$('csv-file').files[0],button=$('csv-form').querySelector('button');
 intakePreview.hidden=!file;button.disabled=!!file;
 if(!file)return;
 intakePreview.textContent='Comprobando columnas, valores y códigos duplicados…';
 try{
  if(file.size>256000)throw Error('El archivo supera los 256 KB permitidos.');
  if(!file.name.toLowerCase().endsWith('.csv'))throw Error('Guarda tu hoja de cálculo como CSV UTF-8 antes de cargarla.');
  const report=await api('/api/public/validate-csv',{method:'POST',headers:{'Content-Type':'text/csv'},body:await file.text()});
  if(version!==intakeVersion)return;
  intakePreview.innerHTML=`<div class="intake-heading"><b>✓ ${report.count} clientes listos para analizar</b><small>${esc(file.name)}</small></div><p>Vista previa de ${report.preview.length} registros. Todavía no se ha consultado al LLM ni guardado la cartera.</p><div class="table-wrap"><table><thead><tr><th>Cliente</th>${Object.values(labels).map(l=>`<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${report.preview.map(c=>`<tr><td>${esc(c.cliente_id)}</td>${Object.keys(labels).map(k=>`<td>${esc(c[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  button.disabled=false;
 }catch(error){if(version!==intakeVersion)return;intakePreview.innerHTML=`<p class="notice error"><b>Revisa el archivo antes de continuar.</b><br>${esc(error.message)}</p>`;}
});
// Double submissions should not consume additional provider quota.
const previousWork=work;
let analysisBusy=false;
work=async function(fn){
 if(analysisBusy)return;
 analysisBusy=true;
 const buttons=[...document.querySelectorAll('#customer-form button[type="submit"],#csv-form button')];
 const states=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);
 try{return await previousWork(fn);}finally{analysisBusy=false;buttons.forEach((b,i)=>b.disabled=states[i]);}
};
