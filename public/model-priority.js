// One source of truth for automatic Quorum participant and moderator priorities.
// Grok intentionally comes last because its availability is less reliable.
// Explicit user moderator choices override this automatic fallback.
export const MODEL_PRIORITY=Object.freeze(['claude','openai','mistral','gemini','qwen','deepseek','grok']);

export function defaultParticipants(available,limit=3){
 const enabled=new Set(available);
 return MODEL_PRIORITY.filter(id=>enabled.has(id)).slice(0,Math.max(0,limit));
}

export function preferredModerator(selected){
 const enabled=new Set(selected);
 return MODEL_PRIORITY.find(id=>enabled.has(id))||null;
}

export function chooseModerator(selected,current,{manual=false}={}){
 const enabled=new Set(selected);
 return manual&&enabled.has(current)?current:preferredModerator(enabled);
}
