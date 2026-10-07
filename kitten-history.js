/* Public historical facts supplement the catalogue; current API rows always win. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.FuluckKittenHistory=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict'; var request;
  function merge(live,history){
    if(!Array.isArray(live)||!Array.isArray(history))return live;
    var byId=new Map(history.filter(function(k){return k&&k.status==='sold'&&/^\d{4}-\d{5}$/.test(k.breederId);}).map(function(k){return[k.breederId,k];}));
    live.forEach(function(k){var old=byId.get(k.breederId);byId.set(k.breederId,old&&k.status==='sold'?Object.assign({},k,{sourceStatus:old.sourceStatus}):k);});
    return Array.from(byId.values());
  }
  function load(live){
    if(!request)request=fetch('/kitten-history.json').then(function(r){if(!r.ok)throw Error('history');return r.json();}).then(function(d){if(!Array.isArray(d.records))throw Error('history');return d.records;}).catch(function(){request=null;return[];});
    return request.then(function(history){return merge(live,history);});
  }
  return{merge:merge,load:load};
});
