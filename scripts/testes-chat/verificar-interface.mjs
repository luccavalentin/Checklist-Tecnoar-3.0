import { fileURLToPath } from 'node:url'
process.chdir(fileURLToPath(new URL('../../', import.meta.url)))
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { configurar, IDS, rpcResposta } from '../testes-sos/mock-sos.mjs'

const out='output/playwright/ajustes-chat-equipe'
await mkdir(out,{recursive:true})
const b=await chromium.launch()
const results=[]
const cid='aaaaaaaa-1111-4111-8111-111111111111'
try {
 for(const [width,theme] of [[320,'claro'],[390,'escuro'],[600,'claro']]) {
  const c=await b.newContext({viewport:{width,height:900}})
  await configurar(c,'mecanico',theme)
  await c.route('**/rest/v1/sos_chamados?*',r=>r.request().method()==='HEAD'?r.fulfill({status:200,headers:{'content-range':'0-0/57','access-control-expose-headers':'Content-Range'}}):r.fallback())
  const p=await c.newPage(); const errors=[];p.on('pageerror',e=>errors.push(e.message))
  await p.goto('http://127.0.0.1:5175/')
  await p.locator('.mi-chat-central').waitFor()
  await p.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode().catch(()=>{}))))
  await p.waitForTimeout(400)
  const layout=await p.evaluate(()=>({
   overflow:document.documentElement.scrollWidth>innerWidth,
   cards:[...document.querySelector('.mi-linha-status').children].map(e=>e.className),
   statCount:document.querySelectorAll('.mi-numero').length,
   buttonHeight:document.querySelector('.mi-novo').offsetHeight,
   whiteTile:getComputedStyle(document.querySelector('.mi-chat-icone')).backgroundColor,
  }))
  assert.equal(layout.overflow,false);assert.equal(layout.statCount,5);assert.match(layout.cards[1],/mi-chat/);assert.equal(layout.whiteTile,'rgba(0, 0, 0, 0)')
  await p.locator('.mi-numero').filter({hasText:'No ano'}).getByText('57',{exact:true}).waitFor()
  await p.screenshot({path:`${out}/painel-${width}-${theme}.png`,fullPage:true})
  await p.goto('http://127.0.0.1:5175/perfil')
  const save=p.getByRole('button',{name:'Salvar',exact:true})
  await save.waitFor(); const saveSize=await save.evaluate(e=>({height:e.offsetHeight,width:e.offsetWidth}))
  assert.ok(saveSize.height<=48);assert.ok(saveSize.width<=280)
  await p.goto('http://127.0.0.1:5175/catalogo/produtos')
  await p.locator('.catalogo-miniatura').first().waitFor()
  await p.waitForTimeout(300)
  await p.screenshot({path:`${out}/produtos-${width}-${theme}.png`,fullPage:true})
  results.push({id:`mecanico-${width}-${theme}`,layout,saveSize,errors})
  await c.close()
 }
 for(const [persona,theme] of [['cliente','claro'],['cliente','escuro'],['mecanico','escuro']]){
  const c=await b.newContext({viewport:{width:390,height:844}})
  await configurar(c,persona,theme)
  const owner=persona==='cliente'?IDS.cliente:IDS.mecanico
  const messages=[{id:'bbbbbbbb-1111-4111-8111-111111111111',conversa_id:cid,autor_id:IDS.equipe,autor_papel:'central',autor_nome:'Atendente Tecnoar',texto:'Olá! Como podemos ajudar?',midia_caminho:null,midia_tipo:null,entregue_em:null,lida_em:null,apagada_em:null,responde_a:null,duracao_seg:null,local_lat:null,local_lng:null,created_at:new Date().toISOString()}]
  await c.route('**/rest/v1/rpc/tecnoar_chat_abrir',r=>r.fulfill({json:cid}))
  await c.route('**/rest/v1/rpc/tecnoar_chat_ler',r=>r.fulfill({json:null}))
  await c.route('**/rest/v1/tecnoar_chat_mensagens?*',r=>r.fulfill({json:[...messages].reverse()}))
  await c.route('**/rest/v1/rpc/tecnoar_chat_enviar',r=>{
   const p=r.request().postDataJSON()
   messages.push({...messages[0],id:p.p_id,autor_id:owner,autor_nome:'Cliente',autor_papel:'cliente',texto:p.p_texto,responde_a:p.p_responde,created_at:new Date().toISOString()})
   return r.fulfill({json:p.p_id})
  })
  const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message))
  await p.goto('http://127.0.0.1:5175/chat-tecnoar')
  await p.getByText('Atendimento humano',{exact:true}).waitFor()
  await p.getByRole('textbox',{name:'Mensagem',exact:true}).fill('Gostaria de consultar uma peça')
  await p.getByRole('button',{name:'Enviar',exact:true}).click()
  await p.getByText('Gostaria de consultar uma peça',{exact:true}).waitFor()
  assert.equal(messages.length,2)
  await p.getByRole('button',{name:'Buscar mensagens',exact:true}).click()
  await p.getByRole('textbox',{name:'Buscar nesta conversa'}).fill('consultar')
  assert.equal(await p.getByText('Olá! Como podemos ajudar?',{exact:true}).count(),0)
  await p.getByRole('button',{name:'Fechar busca'}).click()
  await p.screenshot({path:`${out}/chat-${persona}-${theme}.png`})
  results.push({id:`chat-${persona}-${theme}`,sent:true,search:true,errors})
  if(persona==='cliente'){
   await p.goto('http://127.0.0.1:5175/perfil')
   await p.getByText('Seus dados',{exact:true}).waitFor()
   assert.equal(await p.locator('#perfil-aparelho').count(),0)
   assert.equal(await p.locator('a[href="/notificacoes"]').count(),1)
  }
  await c.close()
 }
}finally{await b.close()}
await writeFile(`${out}/resultado.json`,JSON.stringify(results,null,2))
console.log(JSON.stringify(results,null,2))
assert.ok(results.every(r=>!r.errors.length))
