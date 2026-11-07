/**
 * Lista de origem dos sites bloqueados na comunidade: os mesmos domínios que a migração
 * 20261106220000_comunidade_links_seguros põe em `community_blocked_domains` (o teste
 * communityLinks.test.js compara as duas). Os que a equipa junta no painel e os que o filtro
 * de reputação apanha só a base de dados os conhece: aí, o aviso vem dela ao publicar.
 */
export const BLOCKED_ADULT = [
  'tube8.com', 'drtuber.com', 'beeg.com', 'hclips.com', 'nuvid.com', '4tube.com', 'motherless.com',
  'manyvids.com', 'clips4sale.com', 'myfreecams.com', 'cam4.com', 'flirt4free.com', 'imlive.com',
  'streamate.com', 'realitykings.com', 'bangbros.com', 'naughtyamerica.com', 'mofos.com', 'erome.com',
  'thothub.to', 'hanime.tv', 'gelbooru.com', 'danbooru.donmai.us', 'adultfriendfinder.com',
  'ashleymadison.com', 'brasileirinhas.com.br', 'sexlog.com', 'cameraprive.com', 'privacy.com.br',
  'playboy.com', 'fakku.net', 'luscious.net', 'imagefap.com', 'literotica.com', 'sxyprn.com',
  'daftsex.com', 'cumlouder.com', 'dinotube.com', 'tubegalore.com', 'perfectgirls.net', 'youjizz.com',
  'slutload.com', 'keezmovies.com', 'extremetube.com', 'iwank.tv', 'heavy-r.com', 'efukt.com',
  'boyfriendtv.com', 'javhd.com', 'javlibrary.com', 'missav.com', 'thisvid.com', 'f95zone.to',
];

export const BLOCKED_SHORTENERS = [
  'bit.ly', 'bitly.com', 'bit.do', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly', 'is.gd', 'v.gd',
  'buff.ly', 'cutt.ly', 'rebrand.ly', 'shorturl.at', 'tiny.cc', 'rb.gy', 's.id', 't.ly',
  'shorte.st', 'ouo.io', 'bc.vc', 'adf.ly', 'linkvertise.com', 'lnkd.in', 'soo.gd', 'clck.ru',
  'shrtco.de', 'tiny.one', 'short.io', 'encurtador.com.br', 'abre.ai', 'gg.gg', 'u.to', 'x.co',
  'po.st', 'surl.li', 'cutt.us', 'shorturl.com', 'urlz.fr', 'cli.re', 'did.li',
];

export const BLOCKED_MALICIOUS = [
  'grabify.link', 'iplogger.org', 'iplogger.com', 'iplogger.ru', 'iplogger.co', 'iplogger.info',
  '2no.co', 'yip.su', 'ipgrabber.ru', 'ipgraber.ru', 'blasze.com', 'ps3cfw.com', 'stopify.co',
  'joinmy.site', 'curiouscat.club', 'catsnthings.fun', 'gamingfun.me', 'headshot.monster',
  'screenshare.host', 'myprivate.pics', 'noodshare.com', 'bmwforum.co', 'quickmessage.us',
  'leancoding.co', 'freegiftcards.co',
];
