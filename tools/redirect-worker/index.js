// The game used to live at veronicat.<account>.workers.dev. This Worker keeps old links
// alive by sending them to the Pages project, path and query intact.
export default {
  fetch(request) {
    const url = new URL(request.url);
    return Response.redirect(`https://veronicat.pages.dev${url.pathname}${url.search}`, 301);
  },
};
