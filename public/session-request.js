// Only retry operations whose 401 response precedes any task or provider work.
export async function withSessionRecovery(request,renew){
 try{return await request();}
 catch(error){
  if(error.status!==401)throw error;
  await renew();
  return request();
 }
}
