var i={},N=(M,y,S)=>(i.__chunk_44710=(f,p,a)=>{"use strict";var c=Object.create,s=Object.defineProperty,O=Object.getOwnPropertyDescriptor,g=Object.getOwnPropertyNames,b=Object.getPrototypeOf,q=Object.prototype.hasOwnProperty,d=(e,t,n,o)=>{if(t&&typeof t=="object"||typeof t=="function")for(let r of g(t))q.call(e,r)||r===n||s(e,r,{get:()=>t[r],enumerable:!(o=O(t,r))||o.enumerable});return e},w=((e,t)=>function(){return t||(0,e[g(e)[0]])((t={exports:{}}).exports,t),t.exports})({"../../node_modules/dedent-tabs/dist/dedent-tabs.js"(e){Object.defineProperty(e,"__esModule",{value:!0}),e.default=function(t){for(var n=typeof t=="string"?[t]:t.raw,o="",r=0;r<n.length;r++)if(o+=n[r].replace(/\\\n[ \t]*/g,"").replace(/\\`/g,"`").replace(/\\\$/g,"$").replace(/\\\{/g,"{"),r<(1>=arguments.length?0:arguments.length-1)){var P=o.substring(o.lastIndexOf(`
`)+1).match(/^(\s*)\S?/);o+=((1>r+1||arguments.length<=r+1?void 0:arguments[r+1])+"").replace(/\n/g,`
`+P[1])}var v=o.split(`
`),u=null;if(v.forEach(function(l){var R=Math.min,x=l.match(/^(\s+)\S+/);if(x){var j=x[1].length;u=u?R(u,j):j}}),u!==null){var k=u;o=v.map(function(l){return l[0]===" "||l[0]==="	"?l.slice(k):l}).join(`
`)}return o.trim().replace(/\\n/g,`
`)}}}),h={};((e,t)=>{for(var n in t)s(e,n,{get:t[n],enumerable:!0})})(h,{getOptionalRequestContext:()=>_,getRequestContext:()=>C}),f.exports=d(s({},"__esModule",{value:!0}),h),a(36878);var m=((e,t,n)=>(n=e!=null?c(b(e)):{},d(!t&&e&&e.__esModule?n:s(n,"default",{value:e,enumerable:!0}),e)))(w()),E=Symbol.for("__cloudflare-request-context__");function _(){let e=y[E];if((process?.release?.name==="node"?"nodejs":"edge")=="nodejs")throw Error(m.default`
			\`getRequestContext\` and \`getOptionalRequestContext\` can only be run
			inside the edge runtime, so please make sure to have included
			\`export const runtime = 'edge'\` in all the routes using such functions
			(regardless of whether they are used directly or indirectly through imports).
		`);return e}function C(){let e=_();if(!e)throw process?.env?.NEXT_PHASE==="phase-production-build"?Error(m.default`
				\n\`getRequestContext\` is being called at the top level of a route file, this is not supported
				for more details see https://developers.cloudflare.com/pages/framework-guides/nextjs/ssr/troubleshooting/#top-level-getrequestcontext \n
			`):Error("Failed to retrieve the Cloudflare request context.");return e}},i.__chunk_36878=()=>{},i.__chunk_22457=(f,p,a)=>{"use strict";a.d(p,{_:()=>s});var c=a(44710);function s(){return(0,c.getRequestContext)().env}},i);export{N as __getNamedExports};
