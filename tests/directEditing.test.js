import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRenderer, nextTick } from 'vue'
import { createProject, validateProject, serializeProject } from '../src/domain/project/project.js'
import { evaluateTransition } from '../src/domain/transition/evaluateTransition.js'
import { clientToLogical, logicalToClient, hitShape, pointInQuad, shapePoints } from '../src/editor/previewGeometry.js'
import { applyDirectValues, assertDirectEdit, directContext, directValues, draggedKeyTime } from '../src/editor/directEdit.js'
import { addKey, displayContext } from '../src/editor/displayValues.js'
import { createProjectHistory } from '../src/editor/projectHistory.js'
import { useEditor } from '../src/editor/useEditor.js'
import { STORAGE_KEY } from '../src/editor/projectStorage.js'
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`)
const fixture = () => { const project=createProject();return { project, t:project.transitions[0], selection:{layerId:'group-001',itemId:'item-002'} } }
function editorHost(storedText) {
  const previous=globalThis.window, values=new Map(storedText === undefined ? [] : [[STORAGE_KEY, storedText]]), listeners=new Map()
  globalThis.window={localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},
    addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type)}
  const renderer=createRenderer({createComment:()=>({}),insert(){},remove(){},parentNode:()=>null,nextSibling:()=>null})
  let e;const app=renderer.createApp({setup(){e=useEditor(createProject());return()=>null}});app.mount({})
  return {e,values,listeners,dispose(){app.unmount();globalThis.window=previous}}
}

test('CSS↔論理座標: レターボックス、画面オフセット、DPRを掛けない往復',()=>{
 for(const bounds of [{left:20,top:30,width:1000,height:400},{left:40,top:50,width:320,height:700},{left:0,top:0,width:1920,height:1080}]){
  for(const point of [{x:0,y:0},{x:960,y:540},{x:1920,y:1080}]){const screen=logicalToClient(point,bounds),restored=clientToLogical(screen.x,screen.y,bounds);near(restored.x,point.x);near(restored.y,point.y)}
 }
 assert.equal(clientToLogical(10,10,{left:0,top:0,width:1000,height:400}),null)
 assert.equal(clientToLogical(10,10,{left:0,top:0,width:0,height:0}),null)
 assert.equal(clientToLogical(NaN,10,{left:0,top:0,width:100,height:100}),null)
 assert.ok(clientToLogical(-20,-20,{left:0,top:0,width:100,height:100},true))
})

test('Hit Test: 傾斜・回転・親行列の四角形を判定、手前優先、透明/退化は除外',()=>{
 const {t}=fixture();const shapes=evaluateTransition(t,800).shapes
 const top={...shapes[2],id:'front',style:{color:'#FFFFFF',opacity:1}}
 const center={x:top.worldMatrix[4],y:top.worldMatrix[5]}
 assert.equal(hitShape([...shapes,top],center).id,'front')
 assert.notEqual(hitShape([...shapes,{...top,style:{...top.style,opacity:0}}],center)?.id,'front')
 assert.equal(pointInQuad(shapePoints(top),center),true)
 assert.equal(pointInQuad([{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0}],{x:0,y:0}),false)
 assert.equal(hitShape([],{x:0,y:0}),null)
})

test('ベース直接移動: 回転・非一様scaleの親でもワールドXY一致、Generator変更後もOverride維持',()=>{
 const {project,t,selection}=fixture();const g=t.layers[1];g.transform={x:100,y:20,rotation:32,scaleX:2,scaleY:3}
 const before=directContext(t,selection,'base','individual',800)
 applyDirectValues(t,selection,'base','individual',null,{'transform.x':before.values['transform.x']+80,'transform.y':before.values['transform.y']-40},800)
 validateProject(project)
 const after=directContext(t,selection,'base','individual',800);near(after.values['transform.x'],before.values['transform.x']+80);near(after.values['transform.y'],before.values['transform.y']-40)
 const offset={...g.overrides['item-002'].transform};g.generator.stepX+=20
 assert.deepEqual(g.overrides['item-002'].transform,offset)
 assert.equal(Object.hasOwn(g.overrides['item-002'],'tracks'),true)
})

test('直接移動・回転・一様拡縮の差分は中心を維持し、負scaleの符号を保持',()=>{
 const values={'transform.x':100,'transform.y':200,'transform.rotation':20,'transform.scaleX':-2,'transform.scaleY':3}
 const pivot={x:100,y:200}
 assert.deepEqual(directValues('move',{x:80,y:180},{x:90,y:200},pivot,values),{'transform.x':110,'transform.y':220})
 near(directValues('rotate',{x:200,y:200},{x:100,y:300},pivot,values)['transform.rotation'],110)
 assert.deepEqual(directValues('scale',{x:200,y:200},{x:300,y:200},pivot,values),{'transform.scaleX':-4,'transform.scaleY':6})
 assert.throws(()=>directValues('scale',pivot,pivot,pivot,values),RangeError)
 assert.throws(()=>directValues('move',{x:NaN,y:0},pivot,pivot,values),RangeError)
})

test('子の回転・倍率: 正の一様親scaleで画面値を書き戻し、非一様/0倍率は通知して拒否',()=>{
 const {project,t,selection}=fixture();const g=t.layers[1];g.transform={x:20,y:30,rotation:40,scaleX:2,scaleY:2}
 const context=directContext(t,selection,'base','individual',1200)
 // item-002の回転はabsoluteキーなので倍率を操作する。
 assertDirectEdit(context,selection,'base','individual',null,'scale',1200)
 applyDirectValues(t,selection,'base','individual',null,{'transform.scaleX':4,'transform.scaleY':6},1200)
 const after=directContext(t,selection,'base','individual',1200);near(after.values['transform.scaleX'],4);near(after.values['transform.scaleY'],6);validateProject(project)
 g.transform.scaleY=3
 assert.throws(()=>assertDirectEdit(directContext(t,selection,'base','individual',1200),selection,'base','individual',null,'rotate',1200),/非一様/)
 g.transform.scaleX=0
 assert.throws(()=>assertDirectEdit(directContext(t,selection,'base','individual',1200),selection,'base','individual',null,'move',1200),/倍率|不安定/)
})

test('キー直接編集: 明示選択・同時刻XYを要求し、対象キーだけ変更して他時刻・Childを保持',()=>{
 const {project,t,selection}=fixture(),g=t.layers[1];g.transform.rotation=30
 addKey(t,selection,'individual','transform.x',800);addKey(t,selection,'individual','transform.y',800)
 addKey(t,selection,'individual','transform.x',1200);addKey(t,selection,'individual','transform.y',1200)
 const child=structuredClone(g.childAnimation),last=structuredClone(g.overrides['item-002'].tracks.filter(track=>track.property.startsWith('transform.')).map(track=>track.keyframes.at(-1)))
 const context=directContext(t,selection,'keyframe','individual',800),key={...selection,itemId:selection.itemId,scope:'individual',property:'transform.x',timeMs:800}
 assert.throws(()=>assertDirectEdit(context,selection,'keyframe','individual',null,'move',800),/キーを選択/)
 assertDirectEdit(context,selection,'keyframe','individual',key,'move',800)
 applyDirectValues(t,selection,'keyframe','individual',key,{'transform.x':context.values['transform.x']+50,'transform.y':context.values['transform.y']+60},800)
 const after=displayContext(t,selection,'individual',800);near(after.values['transform.x'],context.values['transform.x']+50);near(after.values['transform.y'],context.values['transform.y']+60)
 assert.deepEqual(g.childAnimation,child)
 assert.deepEqual(g.overrides['item-002'].tracks.map(track=>track.keyframes.at(-1)),last)
 validateProject(project)
})

test('キー時刻ドラッグ: 1ms刻み、隣キー直前/直後で停止、狭すぎる間隔は拒否',()=>{
 const track={keyframes:[{timeMs:0},{timeMs:500},{timeMs:1000}]}
 assert.equal(draggedKeyTime(track,1,9999,1200),999)
 assert.equal(draggedKeyTime(track,1,-100,1200),1)
 assert.equal(draggedKeyTime(track,1,600.7,1200),601)
 assert.equal(draggedKeyTime(track,2,2000,1200),1200)
 assert.throws(()=>draggedKeyTime({keyframes:[{timeMs:0},{timeMs:.2},{timeMs:.5}]},1,.3,1200),RangeError)
 assert.equal(draggedKeyTime({keyframes:[{timeMs:0}]},0,100,0),0)
})

test('履歴: Undo/Redo・分岐でRedo破棄・同じ編集を積まない・上限・クリア',()=>{
 const h=createProjectHistory({limit:2}),a={x:0},b={x:1},c={x:2},d={x:3}
 assert.equal(h.record(a,a),false);h.record(a,b);h.record(b,c);h.record(c,d)
 assert.deepEqual(h.undo(d),c);assert.deepEqual(h.undo(c),b);assert.equal(h.undo(b),null)
 assert.deepEqual(h.redo(b),c);h.record(c,{x:99});assert.equal(h.redo({x:99}),null)
 h.clear();assert.equal(h.state().undoCount,0);assert.equal(h.state().redoCount,0)
 const small=createProjectHistory({maxCharacters:10});small.record({long:'1234567890'},{long:'x'});assert.equal(small.state().undoCount,0)
})

test('Editor: 連続ドラッグを一履歴へまとめ、Undo/RedoしたProjectを自動保存',async()=>{
 const host=editorHost(),e=host.e
 try{
  const original=serializeProject(e.project);e.selectLayer('group-001','item-002');const initial=e.historyState.undoCount
  e.beginGesture();for(let i=0;i<10;i++)e.updateGesture(p=>{p.transitions[0].layers[1].generator.stepX=100+i})
  assert.equal(e.historyState.undoCount,initial);e.endGesture();assert.equal(e.historyState.undoCount,initial+1)
  const changed=serializeProject(e.project);e.undo();assert.equal(serializeProject(e.project),original);e.flush();assert.equal([...host.values.values()][0],original)
  e.redo();assert.equal(serializeProject(e.project),changed);e.flush();assert.equal([...host.values.values()][0],changed)
  const count=e.historyState.undoCount;e.seek(600);e.selectLayer('group-001');assert.equal(e.historyState.undoCount,count)
  await nextTick()
 }finally{host.dispose()}
})

test('Editor: キャンセル・pagehideは確定前へ戻し、JSON追加は既存の履歴を保って取り消せる',async()=>{
 const host=editorHost(),e=host.e
 try{
  const before=serializeProject(e.project);e.beginGesture();e.updateGesture(p=>{p.transitions[0].name='dragging'});e.cancelGesture();assert.equal(serializeProject(e.project),before);assert.equal(e.canUndo,false)
  e.beginGesture();e.updateGesture(p=>{p.transitions[0].name='unconfirmed'});host.listeners.get('pagehide')();assert.equal(serializeProject(e.project),before)
  e.commit(p=>{p.transitions[0].name='confirmed'});assert.equal(e.canUndo,true)
  const confirmed=serializeProject(e.project)
  await e.prepareImport({name:'test.json',text:async()=>before});assert.equal(serializeProject(e.project),confirmed)
  assert.equal(e.applyImport(),true);assert.equal(e.canUndo,true);assert.equal(e.canRedo,false)
  assert.equal(e.project.transitions.length,2);assert.equal(e.project.transitions[0].name,'confirmed');assert.equal(e.historyState.undoCount,2)
  const added=serializeProject(e.project);e.flush();assert.equal(host.values.get(STORAGE_KEY),added)
  e.undo();assert.equal(serializeProject(e.project),confirmed);e.flush();assert.equal(host.values.get(STORAGE_KEY),confirmed)
  e.redo();assert.equal(serializeProject(e.project),added)
  e.undo();e.undo();assert.equal(serializeProject(e.project),before);assert.equal(e.canUndo,false)
  assert.equal(e.gestureActive,false);await nextTick()
 }finally{host.dispose()}
})

test('Editor: 操作中は既存の通知でレイアウトを変えず、成功して確定した時に解除する',()=>{
 const host=editorHost(),e=host.e
 try{
  e.error='前の操作の通知';e.beginGesture();e.updateGesture(project=>{project.transitions[0].name='valid drag'})
  assert.equal(e.error,'前の操作の通知');e.endGesture();assert.equal(e.error,'')
  e.beginGesture();e.updateGesture(project=>{project.transitions[0].durationMs=-1});e.endGesture();assert.ok(e.error)
 }finally{host.dispose()}
})


test('未整列のインポートキーでも時刻順の隣接キーを越えない',()=>{
 const track={keyframes:[{timeMs:1000},{timeMs:0},{timeMs:500}]}
 assert.equal(draggedKeyTime(track,2,1200,1200),999)
 assert.equal(draggedKeyTime(track,2,-20,1200),1)
 assert.equal(draggedKeyTime(track,1,800,1200),499)
})

test('Editor: 前の入力欄の遅いblurで、次のドラッグの履歴単位を終了しない',()=>{
 const host=editorHost(),e=host.e
 try{
  const old=e.beginGesture();e.commit(project=>{project.transitions[0].name='typed'})
  const current=e.beginGesture();e.endGesture(old);assert.equal(e.gestureActive,true)
  assert.equal(e.updateGesture(project=>{project.transitions[0].name='stale'},old),false)
  assert.equal(e.project.transitions[0].name,'typed')
  e.updateGesture(project=>{project.transitions[0].layers[1].generator.stepX=200})
  e.endGesture(current);assert.equal(e.gestureActive,false);assert.equal(e.historyState.undoCount,2)
  e.undo();assert.equal(e.project.transitions[0].name,'typed');assert.notEqual(e.project.transitions[0].layers[1].generator.stepX,200)
 }finally{host.dispose()}
})


test('Editor: 不正JSON・追加の失敗・空の読込は作品と履歴と選択時刻を壊さない',async()=>{
 const host=editorHost(),e=host.e
 try{
  e.selectLayer('group-001','item-002');e.seek(600)
  const before=serializeProject(e.project),selection={...e.selection}
  await e.prepareImport({name:'bad.json',text:async()=>'{'});assert.equal(e.pendingImport,null);assert.equal(e.applyImport(),false)
  assert.equal(serializeProject(e.project),before);assert.equal(e.historyState.undoCount,0)
  await e.prepareImport({name:'changed.json',text:async()=>before});e.pendingImport.project.transitions[0].durationMs=-1
  assert.equal(e.applyImport(),false);assert.ok(e.error);assert.ok(e.pendingImport);assert.equal(serializeProject(e.project),before)
  await e.prepareImport({name:'empty.json',text:async()=>JSON.stringify({schemaVersion:1,transitions:[],slides:[]})})
  assert.equal(e.applyImport(),true);assert.equal(e.pendingImport,null)
  assert.equal(serializeProject(e.project),before);assert.equal(e.historyState.undoCount,0)
  assert.deepEqual(e.selection,selection);assert.equal(e.timeMs,600)
 }finally{host.dispose()}
})

test('Editor: 保存データの復元失敗時は、JSON追加でも元の保存値の保護を解除しない',async()=>{
 const damaged='{damaged storage',host=editorHost(damaged),e=host.e
 try{
  const before=serializeProject(e.project);assert.equal(e.storageBlocked,true)
  await e.prepareImport({name:'add.json',text:async()=>before});assert.equal(e.applyImport(),true)
  assert.equal(e.project.transitions.length,2);assert.equal(e.storageBlocked,true)
  e.flush();assert.equal(host.values.get(STORAGE_KEY),damaged)
  e.undo();assert.equal(serializeProject(e.project),before);e.flush();assert.equal(host.values.get(STORAGE_KEY),damaged)
 }finally{host.dispose()}
})
