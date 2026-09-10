// REFERENCE TABLES for the contact cleaner. Split out from the logic so King and Lee can extend
// the matcher without reading the algorithm: add a nickname, a school abbreviation, a business org
// or an email-domain fix here and the cleaner picks it up.
//
// Ported from clean-contacts.ps1 (the reference implementation Lee wrote alongside the scrape).

export const SCHOOL_ALIASES: Record<string, string> = {
  "Massachusetts Inst of Tech": "Massachusetts Institute of Technology",
};

/** Domain-level typo fixes seen in the scrape. */
export const DOMAIN_TYPOS: Record<string, string> = {
  "alsu.edu": "alasu.edu", "umihc.edu": "umich.edu", "colorad.edu": "colorado.edu",
};

/** Email root domain -> the school that domain actually belongs to. Applied only when the row's
 *  School is NOT already that school; un-scrambles rows the scraper attached to the wrong school. */
export const DOMAIN_SCHOOL: Record<string, string> = {
  "murraystate.edu": "Murray State University", "cumberland.edu": "University of the Cumberlands",
  "csudh.edu": "California State University, Dominguez Hills", "csulb.edu": "California State University, Long Beach",
  "csusb.edu": "California State University, San Bernardino", "csusm.edu": "California State University, San Marcos",
  "csun.edu": "California State University, Northridge", "fullerton.edu": "California State University, Fullerton",
  "calstatela.edu": "California State University, Los Angeles", "cpp.edu": "California State Polytechnic University, Pomona",
  "lmu.edu": "Loyola Marymount University", "uci.edu": "University of California Irvine", "ucla.edu": "University of California Los Angeles",
  "ucr.edu": "University of California Riverside", "ucsb.edu": "University of California Santa Barbara", "ucsd.edu": "University of California San Diego",
  "sandiego.edu": "University of San Diego", "sdsu.edu": "San Diego State University", "usc.edu": "University of Southern California",
  "laverne.edu": "University of La Verne", "woodbury.edu": "Woodbury University", "pepperdine.edu": "Pepperdine University",
  "nebrwesleyan.edu": "Nebraska Wesleyan University", "owu.edu": "Ohio Wesleyan University", "iwu.edu": "Illinois Wesleyan University",
  "olemiss.edu": "University of Mississippi", "binghamton.edu": "Binghamton University", "samford.edu": "Samford University",
  "macalester.edu": "Macalester College", "saintleo.edu": "Saint Leo University", "wright.edu": "Wright State University",
  "wfu.edu": "Wake Forest University", "utk.edu": "University of Tennessee, Knoxville", "columbia.edu": "Columbia University",
  "ksu.edu": "Kansas State University", "k-state.edu": "Kansas State University", "bryant.edu": "Bryant University",
  "colorado.edu": "University of Colorado Boulder", "calpoly.edu": "California Polytechnic State University",
};

/** Shared-system or unknown domains: never reassign a row on these. */
export const AMBIGUOUS_DOMAINS = ["iu.edu", "psu.edu", "uh.edu", "cuny.edu", "mit.edu"];
export const UNKNOWN_DOMAINS = ["batten.edu"];

export const PANHELLENIC_CHAPTERS = [
  "Alpha Chi Omega", "Alpha Delta Pi", "Alpha Epsilon Phi", "Alpha Gamma Delta", "Alpha Omicron Pi", "Alpha Phi",
  "Alpha Sigma Alpha", "Alpha Sigma Tau", "Alpha Xi Delta", "Chi Omega", "Delta Delta Delta", "Delta Gamma",
  "Delta Phi Epsilon", "Delta Zeta", "Gamma Phi Beta", "Kappa Alpha Theta", "Kappa Delta", "Kappa Kappa Gamma",
  "Phi Mu", "Phi Sigma Sigma", "Pi Beta Phi", "Sigma Delta Tau", "Sigma Kappa", "Sigma Sigma Sigma",
  "Zeta Tau Alpha", "Theta Phi Alpha", "Alpha Delta Chi", "Sigma Alpha", "Phi Sigma Rho", "Alpha Omega Epsilon",
];
export const NPHC_CHAPTERS = [
  "Alpha Phi Alpha", "Alpha Kappa Alpha", "Kappa Alpha Psi", "Omega Psi Phi", "Delta Sigma Theta",
  "Phi Beta Sigma", "Zeta Phi Beta", "Sigma Gamma Rho", "Iota Phi Theta",
];
export const MGC_CHAPTERS = [
  "Lambda Theta Phi", "Delta Xi", "Omega Phi Beta", "Delta Epsilon Psi", "Kappa Delta Phi", "Alpha Lambda Mu",
  "Sigma Phi", "Lambda Theta Alpha", "Sigma Lambda Beta", "Sigma Lambda Gamma", "Lambda Phi Epsilon",
  "Phi Iota Alpha", "Chi Upsilon Sigma", "Kappa Phi Lambda", "Delta Tau Lambda", "Epsilon Alpha Sigma",
  "alpha Kappa Delta Phi", "Kappa Delta Chi", "Sigma Lambda Upsilon", "Lambda Upsilon Lambda",
];

/** Business / professional orgs we also want (campus-rep hiring). Matched BEFORE Greek chapters. */
export const CLUB_ORGS: Record<string, string[]> = {
  "Alpha Kappa Psi": ["akpsi", "alphakappapsi"],
  "Delta Sigma Pi": ["deltasigmapi", "dsigmapi", "deltasigpi", "dsp"],
  "Beta Alpha Psi": ["betaalphapsi", "bap"],
  "Women in Business": ["wib", "womeninbusiness"],
  "Financial Management Association": ["fma"],
  "Phi Beta Lambda": ["phibetalambda", "pbl"],
  "Phi Chi Theta": ["phichitheta"],
};

/** Greek-letter abbreviations used to generate handle patterns from a chapter name. */
export const GREEK_ABBR: Record<string, string[]> = {
  alpha: ["alpha", "a"], beta: ["beta", "b"], gamma: ["gamma", "gam", "g"], delta: ["delta", "delt", "d"],
  epsilon: ["epsilon", "ep", "e"], zeta: ["zeta", "z"], eta: ["eta"], theta: ["theta", "th"],
  iota: ["iota", "i"], kappa: ["kappa", "kap", "k"], lambda: ["lambda", "lam", "l"], mu: ["mu", "m"],
  nu: ["nu", "n"], xi: ["xi", "x"], omicron: ["omicron", "o"], pi: ["pi", "p"], rho: ["rho", "r"],
  sigma: ["sigma", "sig", "s"], tau: ["tau", "t"], upsilon: ["upsilon", "u"], phi: ["phi"],
  chi: ["chi", "x"], psi: ["psi"], omega: ["omega", "o"],
};

/** Well-known nicknames. Ambiguous ones are deliberately omitted or shared. */
export const NICKNAMES: Record<string, string[]> = {
  "Pi Kappa Alpha": ["pike", "pikes", "kapi"], "Pi Kappa Phi": ["pikapp", "pikapps"], "Kappa Sigma": ["kappasig", "ksig"],
  "Phi Kappa Psi": ["phipsi", "phikap"], "Sigma Alpha Epsilon": ["sae"], "Alpha Chi Omega": ["axo", "alphachi"],
  "Delta Delta Delta": ["tridelta", "tridelt", "tridelts", "deltas", "ddd"], "Chi Omega": ["chio"], "Alpha Tau Omega": ["ato"],
  "Alpha Delta Pi": ["adpi"], "Alpha Phi": ["alphaphi", "aphi"], "Beta Theta Pi": ["beta", "betas"],
  "Sigma Chi": ["sigmachi", "sigchi"], "Phi Gamma Delta": ["fiji", "phigam"], "Delta Tau Delta": ["delts", "delt", "dtd"],
  "Sigma Phi Epsilon": ["sigep"], "Phi Delta Theta": ["phidelt", "phidelts"], "Sigma Nu": ["sigmanu", "signu"],
  "Alpha Epsilon Pi": ["aepi"], "Delta Gamma": ["dg", "deltagamma"], "Kappa Kappa Gamma": ["kkg", "kappa", "kappas"],
  "Alpha Sigma Phi": ["alphasig", "asig", "alphasigs"], "Tau Kappa Epsilon": ["tke", "teke"],
  "Delta Sigma Phi": ["deltasig", "deltsig", "dsp", "deltasigmaphi"],
  "Alpha Gamma Delta": ["agd", "alphagam"], "Kappa Alpha Theta": ["theta", "thetas", "kat"], "Theta Chi": ["thetachi"],
  "Zeta Tau Alpha": ["zta", "zeta", "zetas"], "Kappa Delta": ["kd", "kappadelta"], "Delta Zeta": ["dz", "deltazeta"],
  "Kappa Alpha Order": ["ka", "kaorder", "kappaalpha", "kappaalphaorder"], "Phi Kappa Tau": ["phitau", "phikap"], "Sigma Pi": ["sigmapi"],
  "Gamma Phi Beta": ["gphi", "gammaphi", "gphib", "gammaphibeta"], "Delta Chi": ["deltachi", "dchi"], "Pi Beta Phi": ["piphi"],
  "Lambda Chi Alpha": ["lambdachi", "lxa"], "Sigma Kappa": ["sigmakappa", "sigkap", "sk"], "Phi Mu": ["phimu"],
  "Alpha Gamma Rho": ["agr"], "Zeta Beta Tau": ["zbt"], "Alpha Xi Delta": ["axid", "alphaxi"], "Alpha Omicron Pi": ["aoii", "aopi"],
  "Sigma Delta Tau": ["sdt", "sigdelt"], "Sigma Sigma Sigma": ["trisigma", "trisig"], "Phi Sigma Kappa": ["psk", "phisig"],
  "Delta Upsilon": ["du", "deltaupsilon"], "Alpha Delta Phi": ["alphadelt", "adphi"], "Sigma Alpha Mu": ["sammy", "sam"],
  "Alpha Epsilon Phi": ["aephi"], "Delta Kappa Epsilon": ["dke", "deke"], "Chi Phi": ["chiphi"], "Alpha Sigma Alpha": ["asa"],
  "Phi Kappa Sigma": ["phikap", "skulls"], "Alpha Kappa Lambda": ["akl"], FarmHouse: ["farmhouse"], "Delta Phi Epsilon": ["dphie"],
  "Theta Xi": ["thetaxi"], "Phi Sigma Sigma": ["phisigmasigma", "phisigsig", "phisig"], Triangle: ["triangle"], Acacia: ["acacia"],
  "Beta Upsilon Chi": ["byx"], "Chi Psi": ["chipsi"], "Kappa Delta Rho": ["kdr"], "Alpha Chi Rho": ["crows", "axp"],
  "Alpha Sigma Tau": ["ast"], "Delta Lambda Phi": ["dlp"], "Alpha Phi Delta": ["apd"], "Phi Sigma Rho": ["phirho", "phisigmarho"],
  "Sigma Tau Gamma": ["sigtau"], "Zeta Psi": ["zetapsi"], "Pi Lambda Phi": ["pilam"], "Delta Phi": ["deltaphi"],
  "Theta Delta Chi": ["tdx", "thetadelt"], "Phi Kappa Theta": ["phikaps", "phikappatheta", "phikap"], "Theta Phi Alpha": ["thetaphi"],
  "Psi Upsilon": ["psiu"], "Tau Epsilon Phi": ["tep"], "Kappa Alpha Society": ["kasociety"],
  "Alpha Phi Alpha": ["alphas", "apa1906"], "Kappa Alpha Psi": ["nupes", "kapsi"], "Omega Psi Phi": ["ques"], "Phi Beta Sigma": ["pbs"],
  "Delta Sigma Theta": ["dst"], "Zeta Phi Beta": ["zphib"], "Sigma Gamma Rho": ["sgrho", "sgrhos"], "Iota Phi Theta": ["iotas"],
  "Alpha Kappa Alpha": ["aka", "akas"], "alpha Kappa Delta Phi": ["akdphi"], "Kappa Delta Chi": ["kdchi"],
};

export const SCHOOL_NICK: Record<string, string[]> = {
  "University of Missouri": ["mizzou"], "University of Alabama": ["bama", "alabama"], "University of Mississippi": ["olemiss"],
  "University of Massachusetts Dartmouth": ["umassd", "umass"], "University of Massachusetts Lowell": ["umass", "uml"],
  "University of California Berkeley": ["cal", "berkeley"], "University of Pennsylvania": ["penn", "upenn"], "Vanderbilt University": ["vandy"],
  "University of Colorado Boulder": ["boulder", "cu"], "Miami University": ["miamioh", "miamiu", "miami"], "Ohio University": ["ohiou"],
  "University of Washington": ["udub"], "Kansas State University": ["kstate"], "Texas State University": ["txst", "txstate"],
  "Stephen F. Austin State University": ["sfa", "sfasu"], "University of Idaho": ["uidaho"], "California Polytechnic State University": ["calpoly", "slo"],
  "Case Western Reserve University": ["cwru"], "Rose-Hulman Institute of Technology": ["rhit"], "University of Michigan": ["umich"],
  "Michigan State University": ["msu", "spartans"], "Pennsylvania State University": ["pennstate", "psu"], "University of Texas at Austin": ["texas", "ut", "utaustin"],
  "The University of Texas at Arlington": ["uta"], "The University of Texas at Dallas": ["utd"], "The University of Texas at San Antonio": ["utsa"],
  "University of North Texas": ["unt", "northtexas"], "University of Nevada, Las Vegas": ["unlv", "nevada"], "University of Kansas": ["kansas", "ku"],
  "University of Kentucky": ["kentucky", "uky"], "University of Georgia": ["uga"], "Georgia Institute of Technology": ["gatech", "gt"],
  "George Washington University": ["gwu", "gw"], "George Mason University": ["gmu"], "James Madison University": ["jmu"], "Virginia Tech": ["vt"],
  "West Virginia University": ["wvu"], "Western Kentucky University": ["wku"], "Middle Tennessee State University": ["mtsu"],
  "University of Tennessee, Knoxville": ["utk", "tennessee"], "Florida International University": ["fiu"], "Florida Atlantic University": ["fau"],
  "University of Central Florida": ["ucf"], "University of South Florida": ["usf"], "Florida Gulf Coast University": ["fgcu"],
  "University of Southern California": ["usc"], "University of California Los Angeles": ["ucla"], "University of California San Diego": ["ucsd"],
  "University of California Santa Barbara": ["ucsb"], "University of Southern Mississippi": ["usm"], "Southern Methodist University": ["smu"],
  "Louisiana State University": ["lsu"], "Ohio State University": ["osu", "ohiostate"], "Oregon State University": ["osu", "oregonstate"],
  "Oklahoma State University": ["okstate", "osu"], "University of Oklahoma": ["ou", "oklahoma"], "North Carolina State University": ["ncsu"],
  "University of North Carolina at Charlotte": ["charlotte", "uncc"], "Northeastern University": ["neu"], "New York University": ["nyu"],
  "Rensselaer Polytechnic Institute": ["rpi"], "Rochester Institute of Technology": ["rit"], "Sam Houston State University": ["shsu"],
  "University of Wisconsin–Milwaukee": ["uwm"], "University of Wisconsin–Oshkosh": ["uwo", "uwosh"], "University of Minnesota": ["umn", "minnesota"],
  "Eastern Michigan University": ["emu"], "Michigan Technological University": ["mtu"], "Bowling Green State University": ["bgsu"],
  "Indiana University Bloomington": ["indiana", "iu"], "Iowa State University": ["iastate", "isu"], "University of Iowa": ["uiowa", "iowa"],
  "University of Arkansas": ["arkansas", "uark"], "Arkansas State University": ["astate"], "Kennesaw State University": ["kennesaw", "ksu"],
  "University of Cincinnati": ["uc", "cincinnati"], "Old Dominion University": ["odu"], "University of Delaware": ["udel", "ud"], "Loyola University Chicago": ["luc"],
  "University of Houston": ["uh", "houston"], "University at Buffalo (SUNY)": ["ub", "buffalo"], "University of Illinois Urbana-Champaign": ["uiuc", "illinois"],
  "University of Illinois Chicago": ["uic"], "University of Vermont": ["uvm"], "Colorado School of Mines": ["mines"], "Colorado State University": ["csu"],
  "University of Colorado Colorado Springs": ["uccs", "coloradosprings"], "Massachusetts Institute of Technology": ["mit"],
};

/** Handle tokens that mean "not a chapter account". */
export const COUNCIL_TOKENS = /panhel|ifc|nphc|mgc|fsl|sfl|greek|frat|soror|council|cpc|igc|osfl|ofsl|npc|fsilg/;
export const NON_CHAPTER_TOKENS = /university|college|edu$|^apo|apo$|_apo|kkpsi|classbios|success|blc$|students?$|chapter$|^u[a-z]{1,4}$|alumni/;

export const GREEK_WORD_RX = /^(Alpha|Beta|Gamma|Delta|Epsilon|Zeta|Eta|Theta|Iota|Kappa|Lambda|Mu|Nu|Xi|Omicron|Pi|Rho|Sigma|Tau|Upsilon|Phi|Chi|Psi|Omega|Acacia|FarmHouse|Triangle|alpha Kappa)\b/;
export const ORG_WORD_RX = /\b(Office|Inbox|Council|Life|Department|Greek|Fraternity|Sorority|General|Staff|Team|Association|Club|Society|Fund|Group|Chapter|Center|Women|Business|Investment|Finance|Economics|Collective|Instagra[mn]|Advancement|Engagement|Involvement|Activities|National|Official|Organization|Org)\b/;
export const STAFF_TITLE_RX = /Advis|Director|Coordinator|Dean|Assistant|Graduate|Manager|Specialist|Administrative|Staff|Sponsor|Faculty|Instructor|Program |Associate|Executive Assistant|Vice President for Student|Support|Contact$|Inquir|Inbox|Office|Email|Community Director|Safety Officer/;
export const STUDENT_TITLE_RX = /^(President|Vice President|Treasurer|Secretary|Chair|Historian|Parliamentarian|Basileus|Consul|Officer|Director of|Co-Director|Executive Vice|Internal Vice|Junior Vice|Senior Vice|Chief of Staff|Scholarship|Standards|Finance|Communications|Public Relations|Brotherhood|Marketing|Programming|Philanthropy|Recruitment|Community Service|Social|Brother)/;
export const OFFICE_TITLE_RX = /^(FSL|FSA|FSE|OFSL|OSFL|Greek Life|Fraternity and Sorority Life|Office of|Student|Sorority and Fraternity|Center for|Campus Life|Fraternity and Sorority Affairs|General|Council Email|Council Officers|Executive Board|IFC Executive Board|Chapter Inbox|Recruitment Inbox|Interfraternity Council|Greek Council|R\.I\.S\.E\. Center|Contact|Office Contact|Donation Inquiries|Instagram|Official Instagram|Organization|Org)\b/;

export const FSL_OFFICE_NAME = "Fraternity and Sorority Life Office";
export const FSL_OFFICE_ALIASES = new Set([
  "Office of Fraternity and Sorority Life", "Fraternity and Sorority Life Office", "Office of Fraternity & Sorority Life",
  "Fraternity & Sorority Life Office", "Fraternity and Sorority Life", "Greek Life Office", "Office of Greek Life",
  "FSL Office", "FSA Office", "OFSL Staff", "FSL Team", "Fraternity & Sorority Life Team", "Fraternity and Sorority Life Team",
]);
