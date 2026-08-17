import type {
  ArrangementDNA,
  ArrangementSectionRole,
  CompositionDNA,
  HarmonyDNA,
  SectionProductionDirection,
  SongDNAGenreFamily,
  SonicDNA
} from "@/lib/song-architect/types";

export type ParsedStructureSection = {
  id: string;
  label: string;
  role: ArrangementSectionRole;
  index: number;
  isFinalPayoff: boolean;
};

type EnergyBand = "low" | "mid" | "high";

type RoleVocab = {
  drums: [string, string, string];
  bass: [string, string, string];
  vocal: [string, string, string];
  layering: [string, string, string];
  production: [string, string, string];
  density: [string, string, string];
  spatial: [string, string, string];
};

const ROLE_ENERGY: Record<ArrangementSectionRole, number> = {
  intro: 3,
  verse: 4,
  "pre-chorus": 6,
  chorus: 8,
  hook: 8,
  "post-chorus": 7,
  drop: 9,
  breakdown: 3,
  bridge: 5,
  "final-chorus": 9,
  outro: 3,
  other: 5
};

const FAMILY_FORBIDDEN: Partial<Record<SongDNAGenreFamily, RegExp>> = {
  acoustic: /\bfour-on-the-floor\b|\bsidechain|\bfestival drop\b|\briser|\b808\b|\bsynth lead\b|\bdembow\b/i,
  "hip-hop": /\bfour-on-the-floor\b|\bfestival drop\b|\bsidechain-driven\b|\briser into drop\b|\bdembow\b/i,
  "nu-metal": /\bdembow\b|\bfour-on-the-floor\b|\bfestival-ready\b|\bacoustic campfire\b/i,
  rock: /\bdembow\b|\bfour-on-the-floor\b|\bsidechain-driven\b|\b808 slides\b/i,
  pop: /\bdembow\b|\bdowntuned\b|\b808 slides\b|\bfestival drop\b/i,
  rnb: /\bdembow\b|\bfestival drop\b|\bfour-on-the-floor\b|\bdowntuned\b/i,
  ballad: /\bdembow\b|\bfestival drop\b|\bfour-on-the-floor\b|\b808\b/i,
  reggaeton: /\bfour-on-the-floor\b|\bdowntuned\b|\bfestival drop\b|\bacoustic campfire\b/i,
  edm: /\bdembow\b|\bdowntuned\b|\b808 slides\b|\bacoustic campfire\b/i
};

const FAMILY_VOCAB: Record<Exclude<SongDNAGenreFamily, "generic">, Partial<Record<ArrangementSectionRole, RoleVocab>>> = {
  edm: {
    intro: {
      drums: ["muted pulse, kick held back", "soft four-on-the-floor, hats filtered", "opening kick grid"],
      bass: ["sub hinted, filtered", "sidechained bass entering", "kick-locked bass"],
      vocal: ["optional topline fragment", "dry topline tease", "clear topline"],
      layering: ["single texture", "light doubles", "early stacks held back"],
      production: ["signature synth texture, filtered", "world-building pads and fx", "identity motif established"],
      density: ["sparse", "controlled", "opening"],
      spatial: ["narrow, centered", "slightly opening", "stereo motif"]
    },
    verse: {
      drums: ["restrained four-on-the-floor, hats held", "kick present, hats still filtered", "fuller verse grid, still pre-drop"],
      bass: ["sidechained, reduced weight", "kick-locked bass, still tucked", "fuller sidechain movement"],
      vocal: ["dry topline, intelligibility first", "present topline, short phrases", "forward topline"],
      layering: ["single lead", "light doubles", "selective stacks"],
      production: ["filtered synth bed, hold the drop", "groove and vocal space", "more motion, still pre-payoff"],
      density: ["controlled", "supportive", "expanding"],
      spatial: ["narrower verse", "centered groove", "widening slightly"]
    },
    "pre-chorus": {
      drums: ["rising hats, kick still gated", "opening cymbals, increasing movement", "full build drums, tension peak"],
      bass: ["bass filter opening", "sidechain more audible", "weight ready for release"],
      vocal: ["shorter phrases, more urgency", "lifted topline", "pre-drop vocal pressure"],
      layering: ["adding answers", "thicker doubles", "stacks into the release"],
      production: ["filter-build, risers, hold the drop", "increasing tension and movement", "last bar of tension before release"],
      density: ["expanding", "high-motion", "peak tension"],
      spatial: ["widening", "opening image", "wide build"]
    },
    drop: {
      drums: ["full four-on-the-floor", "open hats, punchy kick", "maximum kick/hat payoff"],
      bass: ["unlocked sidechain punch", "kick-bass lock, full weight", "sub-reinforced drop bass"],
      vocal: ["hook chops or anthemic hits", "instrument-led with vocal accents", "chantable drop vocal"],
      layering: ["lead synth over vocal chops", "stacked synth layers", "full synth stack"],
      production: ["synth-led payoff, tension released", "wide lead and fx resolve", "maximum drop identity"],
      density: ["full", "dense payoff", "maximum"],
      spatial: ["wide stereo", "festival width", "widest image"]
    },
    breakdown: {
      drums: ["kick removed or halved", "sparse perc, hats only", "pulse returning"],
      bass: ["bass filtered or gone", "sub hint only", "bass returning"],
      vocal: ["intimate or spoken fragment", "dry vocal space", "rebuild phrase"],
      layering: ["single texture", "thin doubles", "layers returning"],
      production: ["contrast cut, prepare rebuild", "reduced density, motif only", "rebuild toward the next hit"],
      density: ["sparse", "reduced", "rebuilding"],
      spatial: ["narrower", "intimate pocket", "opening again"]
    },
    chorus: {
      drums: ["lifted kick grid", "open hats, chorus punch", "full chorus drums"],
      bass: ["fuller sidechain", "hook-weight bass", "unlocked low end"],
      vocal: ["anthemic hook", "stacked topline", "maximum hook identity"],
      layering: ["doubles and stacks", "wide vocal stack", "full hook layers"],
      production: ["hook lift, wider synths", "full arrangement around the topline", "chorus as identity"],
      density: ["full", "expanded", "maximum"],
      spatial: ["wide", "wider hook", "maximum width"]
    },
    "final-chorus": {
      drums: ["full kick grid plus extra hits", "open cymbals, extra fills", "maximum drum payoff"],
      bass: ["full drop-weight bass", "sub-reinforced lock", "maximum low-end release"],
      vocal: ["expanded hook", "ad-libs over the stack", "final anthemic payoff"],
      layering: ["extra synth and vocal layers", "maximum stacks", "all identity layers"],
      production: ["final drop/chorus payoff", "widest arrangement", "leave nothing in reserve"],
      density: ["maximum", "maximum", "maximum"],
      spatial: ["widest", "festival width", "maximum width"]
    },
    outro: {
      drums: ["kick thinning", "hats and fx only", "final hit then air"],
      bass: ["bass filtering out", "sub fade", "release the lock"],
      vocal: ["hook fragment", "dry last line", "resolved phrase"],
      layering: ["layers peeling", "single leftover motif", "bare identity"],
      production: ["controlled resolution", "filter-out, not a new drop", "deliberate ending"],
      density: ["reducing", "sparse", "resolved"],
      spatial: ["narrowing", "centered", "fade space"]
    }
  },
  "hip-hop": {
    intro: {
      drums: ["count-in or muted pocket", "hats establishing pocket", "kick-snare identity"],
      bass: ["808 hinted", "808 entering", "pocketed 808"],
      vocal: ["ad-lib or tag", "close-mic tease", "first bar in pocket"],
      layering: ["dry", "one ad-lib", "held back"],
      production: ["establish pocket and texture", "sample or key motif", "no festival build"],
      density: ["sparse", "controlled", "pocket-first"],
      spatial: ["centered", "close", "slight hook width later"]
    },
    verse: {
      drums: ["dry kick-snare pocket, hats restrained", "pocketed kit with hat variation", "fuller verse drums, still vocal-first"],
      bass: ["808 held for vocal space", "808 movement under the pocket", "more 808 motion, still tucked"],
      vocal: ["close-mic, rhythmic, intelligibility first", "present rap pocket", "forward verse vocal"],
      layering: ["dry lead, space for bars", "selective ad-libs", "ad-libs between phrases"],
      production: ["vocal space over the beat", "controlled beat density", "pocket, not a drop"],
      density: ["controlled", "supportive", "busier pocket"],
      spatial: ["centered verse", "dry and close", "slightly wider hats"]
    },
    "pre-chorus": {
      drums: ["hat lift, same pocket", "snare variation, no riser wall", "tighter fill into the hook"],
      bass: ["808 slide into the hook", "more movement", "weight ready for hook"],
      vocal: ["shorter cadence, setup line", "setup into the hook", "pressure without EDM build"],
      layering: ["one answer vocal", "thicker doubles", "hook preview"],
      production: ["arrangement lift, keep the pocket", "filter or drum variation", "prepare hook contrast"],
      density: ["expanding", "lifting", "hook-ready"],
      spatial: ["opening a little", "wider hats", "hook width incoming"]
    },
    chorus: {
      drums: ["fuller hook drums", "hat variation, snare lift", "hook-density drums"],
      bass: ["808 more open", "hook-weight 808", "melodic 808 movement"],
      vocal: ["chantable hook, more air", "stacked hook vocal", "hook identity first"],
      layering: ["ad-libs and doubles", "stacked hook", "full hook answers"],
      production: ["hook contrast, wetter space", "beat opens around the hook", "no festival drop language"],
      density: ["fuller", "hook-dense", "maximum hook"],
      spatial: ["wider hook", "wetter hook", "wide but pocketed"]
    },
    hook: {
      drums: ["hook drums, extra movement", "rolling hats, open snare", "full hook kit"],
      bass: ["808 featured", "melodic 808", "hook-weight bass"],
      vocal: ["chantable hook", "stacked hook", "memorable hook identity"],
      layering: ["doubles and ad-libs", "stacked hook", "full answers"],
      production: ["hook contrast over the same pocket", "wetter hook", "identity without a drop"],
      density: ["fuller", "hook-dense", "maximum hook"],
      spatial: ["wider hook", "open hook", "wide pocket"]
    },
    bridge: {
      drums: ["reduced kit or beat switch", "half the hats", "pocket returning"],
      bass: ["808 thinned", "held notes", "808 returning"],
      vocal: ["cadence change or spoken turn", "closer vocal", "setup for last hook"],
      layering: ["dry", "one harmony", "layers returning"],
      production: ["contrast by space, not a festival breakdown", "texture shift", "return to pocket"],
      density: ["reduced", "contrast", "rebuilding"],
      spatial: ["closer", "narrower", "opening"]
    },
    "final-chorus": {
      drums: ["fullest hook drums", "extra hat/snare variation", "maximum hook kit"],
      bass: ["808 fully featured", "most 808 movement", "final hook weight"],
      vocal: ["hook plus extra ad-libs", "stacked last hook", "maximum hook identity"],
      layering: ["all ad-libs", "thickest stacks", "full hook choir"],
      production: ["last-hook payoff", "wettest hook space", "leave the pocket memorable"],
      density: ["maximum", "maximum", "maximum"],
      spatial: ["widest hook", "open", "maximum hook width"]
    },
    outro: {
      drums: ["kit thinning", "hats and tags", "last snare"],
      bass: ["808 fade", "held 808", "release"],
      vocal: ["tag or last bar", "ad-lib outro", "resolved line"],
      layering: ["peeling ad-libs", "dry tag", "bare"],
      production: ["controlled stop or fade", "no new drop", "end on the pocket"],
      density: ["reducing", "sparse", "resolved"],
      spatial: ["narrowing", "centered", "close"]
    }
  },
  "nu-metal": {
    intro: {
      drums: ["tom or industrial hit", "half-time pulse entering", "kit identity"],
      bass: ["distorted bass hinted", "riff-locked bass entering", "weight arriving"],
      vocal: ["texture or shouted tag", "low spoken/rap fragment", "identity line"],
      layering: ["single riff", "guitar + texture", "held back"],
      production: ["establish riff and industrial color", "signature guitar texture", "world of weight"],
      density: ["sparse riff", "controlled", "identity"],
      spatial: ["tight", "centered riff", "room arriving"]
    },
    verse: {
      drums: ["tight half-time, hats dry", "aggressive snare, still half-time", "more fills, still verse-tight"],
      bass: ["distorted bass locked to the riff", "riff-weight bass", "more movement under the riff"],
      vocal: ["rhythmic/aggressive, close and dry", "rap-to-grit verse", "forward aggressive verse"],
      layering: ["single vocal, grit only", "light doubles on ends", "selective shouts"],
      production: ["palm-muted riff density, tight image", "crush pocket, vocal on top", "pressure without opening yet"],
      density: ["riff-dense, mix-tight", "controlled crush", "high verse pressure"],
      spatial: ["tight verse", "dry and close", "narrow image"]
    },
    "pre-chorus": {
      drums: ["tighten the grid", "snare pressure, fill incoming", "half-time into lift"],
      bass: ["bass more present", "lock even tighter", "weight before release"],
      vocal: ["shorter shouted setup", "grit rising", "setup the sung/shouted hook"],
      layering: ["gang hint", "thicker doubles", "shouts stacking"],
      production: ["thin or choke the riff to raise pressure", "industrial riser texture, not EDM", "last bar of crush"],
      density: ["tightening", "pressure", "peak verse crush"],
      spatial: ["still tight", "slightly opening", "ready to widen"]
    },
    chorus: {
      drums: ["more open kit, crash lift", "double-time or fuller backbeat", "full chorus drums"],
      bass: ["bass opens with the riff", "sub-reinforced distorted bass", "full riff-lock weight"],
      vocal: ["melodic or shouted hook contrast", "aggressive-to-melodic release", "memorable hook identity"],
      layering: ["gang vocals, stacked shouts", "wide hook stacks", "full gang + lead"],
      production: ["open guitars, less mute, wider crush-release", "full distorted guitars", "chorus as the valve"],
      density: ["expanded", "full", "high payoff"],
      spatial: ["wider chorus", "larger room", "wide guitars"]
    },
    bridge: {
      drums: ["half-time breakdown or industrial bed", "reduced kit", "rebuild fills"],
      bass: ["held weight or drop to texture", "bass thinned", "riff returning"],
      vocal: ["spoken, sung, or opposite of the verse", "contrast delivery", "setup last chorus"],
      layering: ["sparse", "one harmony or shout", "layers returning"],
      production: ["breakdown contrast, texture pivot", "industrial bed or clean guitar", "rebuild the riff"],
      density: ["reduced", "contrast", "rebuilding"],
      spatial: ["different room", "narrower or wetter", "opening"]
    },
    breakdown: {
      drums: ["half-time chugs, snare cracks", "toms and hits only", "slow crush"],
      bass: ["stopped or one-note weight", "sub hits", "lock returning"],
      vocal: ["shouted or silent space", "gang hits", "command vocal"],
      layering: ["unison shouts", "gang only", "held"],
      production: ["breakdown: palm-mute, space, then hit", "reduce density, keep weight", "prepare the return"],
      density: ["reduced but heavy", "sparse hits", "rebuilding"],
      spatial: ["tight and dry", "close", "room returning"]
    },
    "final-chorus": {
      drums: ["fullest kit, extra crashes", "double-time lift available", "maximum drum intensity"],
      bass: ["maximum riff-lock weight", "sub-reinforced", "full distorted bass"],
      vocal: ["hook plus extra gang/ad-libs", "melodic + aggressive together", "final vocal contrast"],
      layering: ["all gangs and stacks", "thickest guitars + vocals", "leave nothing"],
      production: ["expanded payoff, open chords over the riff", "maximum arrangement", "final crush-release"],
      density: ["maximum", "maximum", "maximum"],
      spatial: ["widest", "largest room", "maximum width"]
    },
    outro: {
      drums: ["kit thinning or last hit", "industrial tail", "stop"],
      bass: ["feedback or held note", "weight fading", "cut"],
      vocal: ["last shout or spoken line", "resolved phrase", "dry end"],
      layering: ["peeling", "riff only", "bare"],
      production: ["deliberate stop or feedback resolve", "not a tidy pop fade unless needed", "end on the riff"],
      density: ["reducing", "sparse", "resolved"],
      spatial: ["narrowing", "dry", "cut to air"]
    }
  },
  pop: {
    intro: {
      drums: ["soft count or perc", "groove identity", "kit entering"],
      bass: ["bass hinted", "supportive bass in", "pocket set"],
      vocal: ["hook fragment", "conversational tease", "clear lead"],
      layering: ["single", "light", "held"],
      production: ["establish hook motif", "keys/drums identity", "world of the song"],
      density: ["sparse", "controlled", "opening"],
      spatial: ["close", "centered", "slight width"]
    },
    verse: {
      drums: ["restrained kit, chorus lift reserved", "clean pocket, hats modest", "fuller verse, still controlled"],
      bass: ["supportive, simple", "melodic support", "more movement"],
      vocal: ["conversational, clear, dry-ish", "present storytelling lead", "forward verse"],
      layering: ["single lead", "light doubles", "selective"],
      production: ["controlled verse density, hook space later", "keys and groove under the story", "ear-candy held for transitions"],
      density: ["controlled", "supportive", "busier but not chorus"],
      spatial: ["intimate verse", "centered", "slightly wider"]
    },
    "pre-chorus": {
      drums: ["hat lift, fill incoming", "opening cymbals", "build into the hook"],
      bass: ["forward motion", "lift with the chords", "weight for chorus"],
      vocal: ["shorter, more urgent lines", "lifted melody", "setup the hook"],
      layering: ["adding answers", "thicker doubles", "stacks incoming"],
      production: ["tension and ear-candy into the chorus", "widening arrangement", "prepare hook clarity"],
      density: ["expanding", "lifting", "chorus-ready"],
      spatial: ["opening", "wider", "pre-hook width"]
    },
    chorus: {
      drums: ["full chorus kit, open hats", "punchy lift", "hook-weight drums"],
      bass: ["fuller supportive bass", "chorus movement", "melodic lift"],
      vocal: ["clearest hook language", "stacked hook vocal", "maximum hook identity"],
      layering: ["doubles and stacks", "wide vocal stack", "full hook layers"],
      production: ["chorus lift, hook clarity first", "expanded arrangement", "ear-candy around the hook"],
      density: ["full", "expanded", "hook-max"],
      spatial: ["wide chorus", "open image", "widest hook"]
    },
    "post-chorus": {
      drums: ["groove continues", "hook-perc variation", "momentum drums"],
      bass: ["keep the pocket", "hook bass", "movement"],
      vocal: ["hook echo or syllable hook", "chant tag", "identity repeat"],
      layering: ["instrumental hook", "light stacks", "tag layers"],
      production: ["reinforce hook or groove", "preserve momentum", "do not restart the verse yet"],
      density: ["full enough", "groove-forward", "hook echo"],
      spatial: ["still wide", "open", "held width"]
    },
    bridge: {
      drums: ["reduced kit", "different perc", "rebuild fill"],
      bass: ["thinner", "new motion", "returning"],
      vocal: ["contrast lyric and melody", "more intimate or more spoken", "setup last chorus"],
      layering: ["sparse", "one harmony", "stacks returning"],
      production: ["contrast, then home", "new texture, same song", "prepare final lift"],
      density: ["reduced", "contrast", "rebuilding"],
      spatial: ["closer", "different image", "opening"]
    },
    "final-chorus": {
      drums: ["biggest chorus kit", "extra fills", "maximum lift"],
      bass: ["fullest bass", "most movement", "final weight"],
      vocal: ["hook plus extra stacks/ad-libs", "highest hook clarity", "final payoff"],
      layering: ["maximum vocal stack", "extra ear-candy", "all layers"],
      production: ["expanded final chorus", "additional layers", "leave the hook"],
      density: ["maximum", "maximum", "maximum"],
      spatial: ["widest", "open", "maximum"]
    },
    outro: {
      drums: ["kit thinning", "perc tags", "last hit"],
      bass: ["bass simplifying", "held", "out"],
      vocal: ["hook fragment", "last conversational line", "resolved"],
      layering: ["peeling stacks", "single lead", "bare"],
      production: ["controlled resolution", "motif fade", "clean end"],
      density: ["reducing", "sparse", "resolved"],
      spatial: ["narrowing", "centered", "air"]
    }
  },
  rnb: {
    intro: {
      drums: ["soft swung hats", "pocket arriving", "laid-back kit"],
      bass: ["round bass hinted", "melodic bass in", "warm pocket"],
      vocal: ["hum or intimate fragment", "close vocal", "silky tease"],
      layering: ["dry", "whisper double", "held"],
      production: ["warm keys, late-night space", "establish intimacy", "no festival language"],
      density: ["sparse", "restrained", "opening"],
      spatial: ["close vocal, wide pad", "intimate", "warm"]
    },
    verse: {
      drums: ["soft-attack kick, swung hats restrained", "laid-back pocket", "slightly busier hats, still restrained"],
      bass: ["round, understated", "melodic but tucked", "more bass movement"],
      vocal: ["intimate, close, rhythmic-melodic", "silky storytelling", "present but not belted"],
      layering: ["lead plus whispered double", "light harmony", "selective stacks"],
      production: ["vocal intimacy, gradual layer movement", "warm keys under the voice", "restrained groove"],
      density: ["restrained", "supportive", "slowly blooming"],
      spatial: ["close vocal", "intimate", "pads wider than drums"]
    },
    "pre-chorus": {
      drums: ["hat lift, still behind the beat", "pocket opening", "smooth fill"],
      bass: ["bass more lyrical", "forward a little", "warm lift"],
      vocal: ["more air, still intimate", "melisma as lift", "setup the hook"],
      layering: ["harmony entering", "thicker stacks", "hook preview"],
      production: ["smoother lift, extra color", "layers bloom, no slam", "prepare warmth"],
      density: ["blooming", "lifting", "hook-ready"],
      spatial: ["opening", "wider pads", "warm width"]
    },
    chorus: {
      drums: ["fuller pocket, still restrained", "open hats, soft punch", "hook-weight groove"],
      bass: ["round hook bass", "melodic low end", "full warm bass"],
      vocal: ["stacked intimate hook", "harmony-rich lead", "hook as warmth"],
      layering: ["harmony stacks", "whispered doubles + stacks", "full R&B stack"],
      production: ["richer harmony, still human-scaled", "bloom not explosion", "late-night width"],
      density: ["fuller", "expanded but restrained", "hook bloom"],
      spatial: ["wide pads, close lead", "warm width", "open but intimate"]
    },
    bridge: {
      drums: ["kit thinned", "perc only", "pocket returning"],
      bass: ["bass simplified", "held warmth", "returning"],
      vocal: ["more exposed, maybe drier", "confessional turn", "setup last hook"],
      layering: ["almost dry", "one harmony", "stacks returning"],
      production: ["thinner, more intimate", "harmonic pivot", "return home"],
      density: ["reduced", "intimate contrast", "rebuilding"],
      spatial: ["closer", "drier", "opening"]
    },
    "final-chorus": {
      drums: ["fullest still-restrained pocket", "most hat movement", "final groove"],
      bass: ["most lyrical bass", "full warm weight", "final bloom"],
      vocal: ["thickest stacks, still silky", "ad-libs over intimacy", "final hook warmth"],
      layering: ["maximum harmony", "all stacks", "choir-like but close"],
      production: ["slow bloom payoff", "richest harmony", "do not slam"],
      density: ["fullest restrained", "maximum bloom", "maximum"],
      spatial: ["widest warm image", "open", "still vocal-close"]
    },
    outro: {
      drums: ["hats fading", "soft hits", "stop"],
      bass: ["bass resolving", "held", "out"],
      vocal: ["hum or last intimate line", "whispered tag", "resolved"],
      layering: ["peeling", "dry", "bare"],
      production: ["soft resolution", "room left open", "no drop"],
      density: ["reducing", "sparse", "resolved"],
      spatial: ["narrowing to the vocal", "close", "air"]
    }
  },
  reggaeton: {
    intro: {
      drums: ["dembow hinted", "perc identity", "kick-snare dembow in"],
      bass: ["bass hinted", "rounded bass in", "syncopated bass"],
      vocal: ["hook syllable or ad-lib", "rhythmic tease", "lead in"],
      layering: ["dry", "one ad-lib", "held"],
      production: ["establish dembow and bass/perc relationship", "tropical perc color", "vocal space later"],
      density: ["sparse", "controlled", "opening"],
      spatial: ["centered", "club-close", "slight width"]
    },
    verse: {
      drums: ["dembow present, perc restrained", "kick-snare dembow, hats modest", "fuller perc, still vocal-first"],
      bass: ["rounded bass, leave vocal space", "syncopated bass under the grid", "more bass movement"],
      vocal: ["rhythmic-melodic, present, space between phrases", "dry-ish verse vocal", "forward but not stacked"],
      layering: ["single lead, ad-libs between", "light doubles", "selective"],
      production: ["vocal space over dembow", "bass/perc lock, voice on top", "no four-on-the-floor"],
      density: ["controlled", "groove-forward", "busier perc"],
      spatial: ["centered groove", "close vocal", "perc slightly wide"]
    },
    "pre-chorus": {
      drums: ["extra perc, same dembow", "hat/perc lift", "rhythmic transition"],
      bass: ["bass more open", "syncopation featured", "weight for hook"],
      vocal: ["shorter hook setup", "more melodic", "into the chant"],
      layering: ["ad-lib answers", "thicker doubles", "hook preview"],
      production: ["rhythmic transition, not an EDM riser", "filter or perc fill", "prepare hook layering"],
      density: ["expanding", "lifting", "hook-ready"],
      spatial: ["opening", "wider perc", "club width incoming"]
    },
    chorus: {
      drums: ["full dembow, open perc", "hook-weight grid", "fullest club drums"],
      bass: ["bass featured with perc", "rounded hook bass", "full syncopated low end"],
      vocal: ["chantable hook", "stacked hook vocal", "hook identity"],
      layering: ["hook stacks and ad-libs", "thick hook", "full answers"],
      production: ["hook layering over the same dembow", "wider club image", "groove stays latin urban"],
      density: ["full", "hook-dense", "maximum hook"],
      spatial: ["wider hook", "club-wide", "open"]
    },
    bridge: {
      drums: ["dembow reduced or perc-only", "breakdown groove", "grid returning"],
      bass: ["bass thinned", "held", "returning"],
      vocal: ["closer or more spoken", "contrast cadence", "setup last hook"],
      layering: ["dry", "one stack", "returning"],
      production: ["groove reduction, then the loop returns", "rhythmic contrast", "not a festival drop"],
      density: ["reduced", "contrast", "rebuilding"],
      spatial: ["closer", "drier", "opening"]
    },
    "final-chorus": {
      drums: ["fullest dembow", "max perc variation", "final club grid"],
      bass: ["most bass/perc lock", "full rounded weight", "final movement"],
      vocal: ["thickest hook stacks", "ad-libs over the chant", "final hook"],
      layering: ["all stacks", "maximum ad-libs", "full hook"],
      production: ["final hook payoff", "widest club image", "keep dembow identity"],
      density: ["maximum", "maximum", "maximum"],
      spatial: ["widest", "club-wide", "maximum"]
    },
    outro: {
      drums: ["perc thinning", "dembow fade", "last hit"],
      bass: ["bass fade", "held", "out"],
      vocal: ["hook syllable", "ad-lib tag", "resolved"],
      layering: ["peeling", "dry tag", "bare"],
      production: ["controlled end", "loop cadence", "stop clean"],
      density: ["reducing", "sparse", "resolved"],
      spatial: ["narrowing", "centered", "air"]
    }
  },
  acoustic: {
    intro: {
      drums: ["none or room noise", "brush hint", "soft pulse"],
      bass: ["none or guitar low strings", "warm support entering", "understated bass"],
      vocal: ["breath, then close vocal", "intimate fragment", "conversational start"],
      layering: ["single guitar", "guitar + air", "held"],
      production: ["natural room, signature guitar figure", "organic world", "no synthetic intro"],
      density: ["sparse", "human-scaled", "opening"],
      spatial: ["close and centered", "natural room", "intimate"]
    },
    verse: {
      drums: ["none or brushes, very soft", "light percussion, natural dynamics", "modest pulse, still organic"],
      bass: ["guitar low end or warm support", "understated bass", "slightly more support"],
      vocal: ["intimate, dry, conversational", "close lead, natural grain", "present but unprocessed"],
      layering: ["single vocal", "light double on ends", "almost none"],
      production: ["sparse instrumentation, lyrical space", "performance-first", "organic room character"],
      density: ["sparse", "controlled", "still human-scaled"],
      spatial: ["close and centered", "natural room", "intimate"]
    },
    "pre-chorus": {
      drums: ["brush lift if any", "soft fill", "natural swell"],
      bass: ["support stepping forward", "warmer", "ready to open"],
      vocal: ["slightly more air", "lifted but still close", "setup the open chorus"],
      layering: ["hint of harmony", "light double", "harmony incoming"],
      production: ["small widening, no festival build", "strum opening", "human tension"],
      density: ["slightly fuller", "lifting", "chorus-ready"],
      spatial: ["room opening", "a little wider", "still natural"]
    },
    chorus: {
      drums: ["light percussion or fuller brushes", "organic pulse", "human-scaled lift"],
      bass: ["warmer support", "more present low strings", "fullest still-understated bass"],
      vocal: ["more open, still intimate", "light chorus harmony", "hook as a sung line"],
      layering: ["light chorus harmony", "tasteful stack", "human, not a wall"],
      production: ["open strings, fuller guitar, natural lift", "expanded but organic", "no synth/drop language"],
      density: ["fuller acoustic", "expanded, still sparse-capable", "open chorus"],
      spatial: ["more room", "wider natural image", "open but not festival"]
    },
    bridge: {
      drums: ["perc drop out", "brushes only", "pulse returning"],
      bass: ["thinned", "held", "returning"],
      vocal: ["even closer, or spoken-sung", "emotional pivot", "setup last chorus"],
      layering: ["dry", "one harmony", "returning"],
      production: ["sparser guitar or shifted inversion", "organic contrast", "then home"],
      density: ["reduced", "intimate contrast", "rebuilding"],
      spatial: ["closer", "drier room", "opening"]
    },
    "final-chorus": {
      drums: ["fullest organic pulse", "brushes plus soft hits", "still no kit wall"],
      bass: ["warmest support", "fullest understated bass", "human weight"],
      vocal: ["openest sung hook", "harmony plus lead", "final intimate payoff"],
      layering: ["most harmony, still light", "tasteful final stack", "human choir at most"],
      production: ["expanded acoustic payoff", "more open strings and air", "never a drop"],
      density: ["fullest acoustic", "open", "maximum human-scale"],
      spatial: ["widest natural room", "open", "still organic"]
    },
    outro: {
      drums: ["perc gone", "last brush", "air"],
      bass: ["low strings only", "fade", "out"],
      vocal: ["close last line", "breath", "resolved"],
      layering: ["peeling", "guitar + voice", "voice or guitar alone"],
      production: ["deliberate quiet resolution", "room left ringing", "organic end"],
      density: ["reducing", "sparse", "resolved"],
      spatial: ["close", "centered", "natural air"]
    }
  },
  rock: {
    intro: {
      drums: ["count or tom hit", "backbeat arriving", "kit identity"],
      bass: ["bass hinted", "kick-locked bass in", "weight"],
      vocal: ["shout or guitar motif", "line fragment", "lead in"],
      layering: ["guitar figure", "guitar + kit", "held"],
      production: ["establish guitar articulation and room", "band-in-the-room", "riff identity"],
      density: ["sparse riff", "controlled", "opening"],
      spatial: ["room arriving", "wide guitar tease", "centered vocal later"]
    },
    verse: {
      drums: ["tight backbeat, crashes reserved", "live kit, verse intensity", "more fills, still verse"],
      bass: ["locked to kick", "pick attack present", "more movement"],
      vocal: ["chest-forward, dry enough to hear words", "punchy verse", "grit with sustain held"],
      layering: ["single lead", "light double", "gang hint"],
      production: ["guitar articulation, bass/guitar lock", "room character, not a wash", "verse punch"],
      density: ["controlled", "band-tight", "busier"],
      spatial: ["wide guitars, centered vocal", "room", "still verse-scaled"]
    },
    "pre-chorus": {
      drums: ["hat lift, fill", "opening crashes", "build into chorus"],
      bass: ["more forward", "lock into chorus", "weight"],
      vocal: ["shorter punch lines", "lifted melody", "setup the hook"],
      layering: ["double incoming", "gang hint", "stacks incoming"],
      production: ["drum build, guitar opening", "tension by arrangement", "prepare chorus expansion"],
      density: ["expanding", "lifting", "chorus-ready"],
      spatial: ["opening", "wider", "room growing"]
    },
    chorus: {
      drums: ["full kit, open cymbals", "bigger backbeat", "chorus intensity"],
      bass: ["fuller lock", "chorus weight", "movement with guitars"],
      vocal: ["bigger, more sustained", "chorus doubles", "hook identity"],
      layering: ["chorus doubles and gang answers", "wide vocals", "full gangs"],
      production: ["chorus expansion, open guitars", "bigger room", "band payoff"],
      density: ["full", "expanded", "high"],
      spatial: ["wide guitars", "big room", "widest chorus"]
    },
    bridge: {
      drums: ["half or breakdown", "toms/space", "rebuild"],
      bass: ["thinned or featured", "held", "returning"],
      vocal: ["contrast delivery", "closer or spoken", "setup last chorus"],
      layering: ["sparse", "one harmony", "returning"],
      production: ["solo bed or breakdown", "different guitar color", "then home"],
      density: ["reduced", "contrast", "rebuilding"],
      spatial: ["different room", "closer", "opening"]
    },
    "final-chorus": {
      drums: ["biggest kit", "extra crashes", "maximum intensity"],
      bass: ["maximum lock", "full weight", "final movement"],
      vocal: ["hook plus gangs", "highest sustain", "final payoff"],
      layering: ["all gangs and doubles", "thickest guitars", "leave nothing"],
      production: ["maximum chorus expansion", "additional guitar layer", "final room"],
      density: ["maximum", "maximum", "maximum"],
      spatial: ["widest", "largest room", "maximum"]
    },
    outro: {
      drums: ["kit thinning or last crash", "fill out", "stop"],
      bass: ["held or cut", "fade", "stop"],
      vocal: ["last line or shout", "resolved", "dry"],
      layering: ["peeling", "riff", "bare"],
      production: ["deliberate ending", "ring-out or hard stop", "band resolve"],
      density: ["reducing", "sparse", "resolved"],
      spatial: ["narrowing", "room tail", "air"]
    }
  },
  ballad: {
    intro: {
      drums: ["none", "soft pulse", "sparse"],
      bass: ["none", "sustained support", "warm"],
      vocal: ["breathy fragment", "intimate start", "cinematic tease"],
      layering: ["piano or guitar alone", "air", "held"],
      production: ["spacious but close vocal", "slow world-building", "no drop"],
      density: ["sparse", "patient", "opening"],
      spatial: ["intimate start", "hall hinted", "close"]
    },
    verse: {
      drums: ["sparse soft-attack", "held pulse", "still spacious"],
      bass: ["sustained support", "warm", "slightly more"],
      vocal: ["breathy, intimate", "story first", "sustain reserved"],
      layering: ["single", "air around the lead", "late doubles only"],
      production: ["space between lines", "piano/strings under story", "patient"],
      density: ["sparse", "spacious", "controlled"],
      spatial: ["intimate", "growing hall", "still close vocal"]
    },
    chorus: {
      drums: ["soft lift", "more pulse", "human swell"],
      bass: ["fuller sustain", "supportive", "warm weight"],
      vocal: ["more open, still breathy", "late harmony", "sung payoff"],
      layering: ["late-chorus harmony", "tasteful stack", "human"],
      production: ["wider voicings, longer sustain", "gradual rise", "cinematic but not festival"],
      density: ["fuller", "expanded", "open"],
      spatial: ["wider", "lush", "open final later"]
    },
    "final-chorus": {
      drums: ["fullest soft pulse", "swell", "still not a kit wall"],
      bass: ["warmest support", "full sustain", "human weight"],
      vocal: ["widest sung payoff", "harmony plus lead", "final rise"],
      layering: ["most harmony", "lush but human", "final stack"],
      production: ["earned wide final chorus", "longest sustain", "no slam"],
      density: ["fullest ballad", "maximum swell", "maximum human"],
      spatial: ["widest hall", "lush", "open"]
    },
    outro: {
      drums: ["pulse gone", "air", "stop"],
      bass: ["resolve", "fade", "out"],
      vocal: ["close last line", "breath", "resolved"],
      layering: ["peeling", "piano + voice", "bare"],
      production: ["unhurried cadence", "leave air", "soft end"],
      density: ["reducing", "sparse", "resolved"],
      spatial: ["back to intimate", "close", "air"]
    }
  }
};

function clampEnergy(value: number): number {
  return Math.min(10, Math.max(1, Math.round(value)));
}

function energyBand(energy: number): EnergyBand {
  if (energy <= 4) return "low";
  if (energy <= 7) return "mid";
  return "high";
}

function pickBand<T>(tuple: [T, T, T], energy: number): T {
  const band = energyBand(energy);
  if (band === "low") return tuple[0];
  if (band === "mid") return tuple[1];
  return tuple[2];
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export function classifySectionRole(label: string): ArrangementSectionRole {
  const text = label.toLowerCase().trim();
  if (/\bfinal\b.*\bchorus\b|\blast chorus\b|\bchorus\b.*\bfinal\b/.test(text)) return "final-chorus";
  if (/\bpre[-\s]?chorus\b|\bbuild(?:[-\s]?up)?\b|\brisers?\b/.test(text)) return "pre-chorus";
  if (/\bpost[-\s]?chorus\b/.test(text)) return "post-chorus";
  if (/\bbreakdown\b|\bbreak(?:down)?\b/.test(text) && !/\bbreakbeat\b/.test(text)) return "breakdown";
  if (/\bdrop\b/.test(text)) return "drop";
  if (/\bintro\b|\bopening\b/.test(text)) return "intro";
  if (/\boutro\b|\bending\b|\bcoda\b/.test(text)) return "outro";
  if (/\bbridge\b|\bmiddle\s*8\b/.test(text)) return "bridge";
  if (/\bverse\b/.test(text)) return "verse";
  if (/\bhook\b/.test(text)) return "hook";
  if (/\bchorus\b/.test(text)) return "chorus";
  return "other";
}

export function parseStructureSections(structure: string): ParsedStructureSection[] {
  const source = structure.trim();
  if (!source) return [];

  let parts = source.split(/\s*(?:>|→|->|\||\/|;)\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) {
    const comma = source.split(/\s*,\s*/).map((part) => part.trim()).filter(Boolean);
    if (comma.length > 1) parts = comma;
  }

  const seen: Record<string, number> = {};
  return parts.map((label, index) => {
    const role = classifySectionRole(label);
    const key = slug(label) || role;
    seen[key] = (seen[key] ?? 0) + 1;
    const isFinalPayoff = role === "final-chorus" || (/\bfinal\b|\blast\b/.test(label.toLowerCase()) && (role === "drop" || role === "chorus" || role === "hook"));
    return {
      id: `${key}-${seen[key]}`,
      label,
      role,
      index,
      isFinalPayoff
    };
  });
}

function parseCurveHints(energyCurve: string): {
  startBias: number;
  payoffBias: number;
  finalBias: number;
  verseBias: number;
  rise: "flat" | "steady" | "late" | "crush-release";
} {
  const text = energyCurve.toLowerCase();
  let startBias = 0;
  let payoffBias = 0;
  let finalBias = 0;
  let verseBias = 0;
  let rise: "flat" | "steady" | "late" | "crush-release" = "flat";

  if (/\bquiet\b|\bintimate\b|\bconfession\b|\bsparse\b|\bfilter(?:-|\s)?build\b|\bwhisper/.test(text)) {
    startBias -= 1;
    verseBias -= 1;
  }
  if (/\bmedium intro\b|\bmid intro\b/.test(text)) startBias += 0;
  if (/\bopen chorus\b|\bstrong chorus\b|\bchorus lift\b|\bhigh-impact\b|\bexplosive\b|\bhuge\b|\bdrop\b/.test(text)) {
    payoffBias += 1;
  }
  if (/\bbiggest final\b|\bfinal chorus\b|\bhigh-impact final\b|\bfinal drop\b/.test(text)) {
    finalBias += 1;
  }
  if (/\bsteady rise\b|\bgradual\b|\bbloom\b/.test(text)) rise = "steady";
  if (/\blate lift\b|\bdelayed\b/.test(text)) rise = "late";
  if (/\bcrush[-\s]?and[-\s]?release\b|\bcrush[-\s]?release\b/.test(text)) {
    rise = "crush-release";
    verseBias += 2;
    payoffBias += 1;
  }
  return { startBias, payoffBias, finalBias, verseBias, rise };
}

/**
 * Parse an explicit numeric energy curve when the input is predominantly numeric.
 *
 * Policy:
 * - Usable when ≥2 integer tokens dominate the string (comma/arrow/slash/whitespace separators).
 * - Values are clamped to 1–10; malformed tokens are ignored without throwing.
 * - Prose-only curves return undefined so ROLE/keyword inference remains valid.
 */
export function parseExplicitNumericEnergyCurve(energyCurve: string): number[] | undefined {
  const source = energyCurve.trim();
  if (!source) return undefined;

  const tokens = source
    .split(/\s*(?:,|→|->|-|\/|\||;|\s)\s*/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return undefined;

  const numbers: number[] = [];
  let numericTokenCount = 0;
  for (const token of tokens) {
    if (/^-?\d+(?:\.\d+)?$/.test(token)) {
      numericTokenCount += 1;
      const parsed = Number(token);
      if (Number.isFinite(parsed)) numbers.push(clampEnergy(parsed));
    }
  }

  if (numbers.length < 2) return undefined;
  if (numericTokenCount < Math.ceil(tokens.length * 0.6)) return undefined;
  return numbers;
}

export function hasExplicitNumericEnergyCurve(energyCurve: string): boolean {
  return Boolean(parseExplicitNumericEnergyCurve(energyCurve));
}

/**
 * Map an energy curve onto compiled sections.
 *
 * Precedence:
 * 1. Explicit usable numeric curve (authoritative; bypasses ROLE/keyword/family defaults)
 * 2. Keyword + ROLE_ENERGY inference when no usable numeric curve exists
 *
 * Count mismatch (explicit only): truncate surplus values; pad short curves with the last value.
 */
export function mapEnergyCurveToSections(
  sections: ParsedStructureSection[],
  energyCurve: string,
  family: SongDNAGenreFamily
): number[] {
  const explicit = parseExplicitNumericEnergyCurve(energyCurve);
  if (explicit && sections.length > 0) {
    return sections.map((_, index) => {
      if (index < explicit.length) return explicit[index];
      return explicit[explicit.length - 1];
    });
  }

  const hints = parseCurveHints(energyCurve);
  const lastIndex = Math.max(sections.length - 1, 1);

  return sections.map((section, index) => {
    let energy = ROLE_ENERGY[section.role];
    if (section.role === "intro") energy += hints.startBias;
    if (section.role === "verse") energy += hints.verseBias;
    if (section.role === "chorus" || section.role === "hook" || section.role === "drop") energy += hints.payoffBias;
    if (section.isFinalPayoff) energy += hints.finalBias + (family === "edm" || family === "nu-metal" ? 1 : 0);

    if (hints.rise === "steady") {
      energy += Math.round((index / lastIndex) * 2) - 1;
    }
    if (hints.rise === "late" && index / lastIndex < 0.6) {
      energy -= 1;
    }
    if (hints.rise === "crush-release" && (section.role === "chorus" || section.role === "final-chorus" || section.role === "hook")) {
      energy += 1;
    }

    const sameRoleEarlier = sections.slice(0, index).filter((entry) => entry.role === section.role).length;
    if (section.role === "verse" && sameRoleEarlier > 0) energy += 1;

    if (family === "rnb" || family === "acoustic" || family === "ballad") {
      energy -= section.role === "drop" ? 3 : 0;
      if (energy > 8 && (section.role === "chorus" || section.role === "final-chorus")) {
        energy = family === "acoustic" ? Math.min(energy, 8) : Math.min(energy, 9);
      }
    }

    return clampEnergy(energy);
  });
}

function sanitizeDirection(text: string | undefined, family: SongDNAGenreFamily): string | undefined {
  if (!text?.trim()) return undefined;
  const forbidden = FAMILY_FORBIDDEN[family];
  if (forbidden && forbidden.test(text)) return undefined;
  return text.trim();
}

function instrumentationFor(
  sonic: SonicDNA,
  energy: number,
  family: SongDNAGenreFamily,
  role: ArrangementSectionRole
): string[] | undefined {
  const core = sonic.coreInstrumentation ?? [];
  const support = sonic.supportingInstrumentation ?? [];
  if (core.length === 0 && support.length === 0) return undefined;

  const band = energyBand(energy);
  let picked = band === "low" ? core.slice(0, Math.min(2, core.length)) : [...core];
  if (band === "high") {
    picked = [...picked, ...support.slice(0, 2)];
  } else if (band === "mid" && (role === "pre-chorus" || role === "chorus" || role === "drop")) {
    picked = [...picked, ...support.slice(0, 1)];
  }

  const unique = picked.filter((item, index, all) => all.findIndex((entry) => entry.toLowerCase() === item.toLowerCase()) === index);
  const cleaned = unique.filter((item) => !FAMILY_FORBIDDEN[family]?.test(item));
  return cleaned.length > 0 ? cleaned : undefined;
}

function vocabFor(family: SongDNAGenreFamily, role: ArrangementSectionRole): RoleVocab | undefined {
  if (family === "generic") return FAMILY_VOCAB.pop[role] ?? FAMILY_VOCAB.pop.verse;
  const table = FAMILY_VOCAB[family];
  return table[role] ?? table.verse ?? table.chorus;
}

function harmonicFor(
  role: ArrangementSectionRole,
  harmony: HarmonyDNA | undefined,
  family: SongDNAGenreFamily
): string | undefined {
  if (!harmony) return undefined;
  if (role === "verse") return sanitizeDirection(harmony.verseBehavior, family);
  if (role === "pre-chorus") return sanitizeDirection(harmony.preChorusBehavior, family);
  if (role === "chorus" || role === "hook" || role === "final-chorus") return sanitizeDirection(harmony.chorusBehavior, family);
  if (role === "drop" || role === "bridge" || role === "breakdown") {
    return sanitizeDirection(harmony.bridgeOrDropBehavior, family);
  }
  if (role === "outro") return sanitizeDirection(harmony.resolutionBehavior, family);
  return sanitizeDirection(harmony.tensionRelease, family);
}

function transitionFor(
  current: ParsedStructureSection,
  next: ParsedStructureSection | undefined,
  family: SongDNAGenreFamily,
  energy: number
): string | undefined {
  if (!next) {
    return sanitizeDirection(
      family === "acoustic" || family === "ballad" || family === "rnb"
        ? "controlled resolution, leave air"
        : "deliberate resolution",
      family
    );
  }

  const pair = `${current.role}->${next.role}`;
  const edm = family === "edm";
  const hipHop = family === "hip-hop";
  const acoustic = family === "acoustic" || family === "ballad";

  const table: Record<string, string> = {
    "intro->verse": "ease into the vocal pocket",
    "verse->pre-chorus": energy <= 4 ? "gradual tension increase" : "increase movement into the lift",
    "verse->chorus": "direct lift into the hook",
    "verse->drop": edm ? "short lift into the drop" : "open into the payoff",
    "pre-chorus->chorus": "strong release into the hook",
    "pre-chorus->drop": edm ? "riser resolve into the drop" : "release into the payoff",
    "chorus->verse": "pull density back for lyrical space",
    "chorus->post-chorus": "keep momentum, reinforce the hook",
    "chorus->bridge": "contrast cut, new color",
    "chorus->drop": edm ? "roll into the drop" : "into the payoff",
    "hook->verse": "return to pocket and vocal space",
    "drop->breakdown": edm ? "cut density, keep the world" : "reduce density for contrast",
    "drop->verse": "filter back for the next verse",
    "breakdown->drop": edm ? "rebuild into the next drop" : "rebuild into the payoff",
    "breakdown->chorus": "rebuild into the hook",
    "bridge->final-chorus": "rebuild into the final payoff",
    "bridge->chorus": "return home into the hook",
    "chorus->final-chorus": "extra layer into the last payoff",
    "final-chorus->outro": "peel layers into resolution",
    "drop->outro": "controlled come-down"
  };

  let text = table[pair];
  if (!text && next.role === "chorus") text = "lift into the hook";
  if (!text && next.role === "drop" && edm) text = "tension into the drop";
  if (!text && next.role === "verse") text = "return space to the vocal";
  if (!text) text = "move with the form";

  if (hipHop && /riser|festival|sidechain/i.test(text)) {
    text = "drum/vocal variation into the next section";
  }
  if (acoustic && /riser|drop|festival|sidechain/i.test(text)) {
    text = "natural swell into the next section";
  }

  return sanitizeDirection(text, family);
}

function sectionInstructions(section: SectionProductionDirection): string[] {
  const candidates = [
    section.density ? `${section.density} arrangement` : undefined,
    section.vocalDirection,
    section.drumDirection,
    section.vocalLayering,
    section.productionDirection,
    section.transitionIntoNext ? `transition: ${section.transitionIntoNext}` : undefined
  ].filter((item): item is string => Boolean(item));
  return candidates.slice(0, 5);
}

function globalArcFor(
  family: SongDNAGenreFamily,
  energyCurve: string,
  sections: SectionProductionDirection[]
): string {
  const energies = sections.map((section) => section.energy ?? 5);
  const start = energies[0] ?? 4;
  const peak = Math.max(...energies);
  const curve = energyCurve.trim();

  if (family === "edm") {
    return curve || `filtered start (${start}/10) into build/drop payoff (${peak}/10)`;
  }
  if (family === "hip-hop") {
    return curve || `pocket verses into hook contrast (${start}/10 → ${peak}/10)`;
  }
  if (family === "nu-metal") {
    return curve || `crush-and-release across riff and hook (${start}/10 → ${peak}/10)`;
  }
  if (family === "reggaeton") {
    return curve || `dembow body with hook lift (${start}/10 → ${peak}/10)`;
  }
  if (family === "rnb") {
    return curve || `intimate verses blooming into a warmer hook (${start}/10 → ${peak}/10)`;
  }
  if (family === "acoustic" || family === "ballad") {
    return curve || `natural dynamics, sparse start opening on the chorus (${start}/10 → ${peak}/10)`;
  }
  if (family === "rock") {
    return curve || `verse punch into bigger chorus (${start}/10 → ${peak}/10)`;
  }
  return curve || `controlled verses into a clearer hook (${start}/10 → ${peak}/10)`;
}

function transitionStrategyFor(family: SongDNAGenreFamily): string {
  switch (family) {
    case "edm":
      return "filter, riser, and density changes; release on drops";
    case "hip-hop":
      return "pocket, drum variation, and vocal space; hook contrast without EDM builds";
    case "nu-metal":
      return "mute vs open guitars, half-time vs lift, aggressive vs melodic vocal";
    case "reggaeton":
      return "dembow continuity with perc/bass and hook-layer changes";
    case "rnb":
      return "gradual layer movement and harmonic bloom";
    case "acoustic":
    case "ballad":
      return "natural dynamics and room; no synthetic build vocabulary";
    case "rock":
      return "guitar articulation and room size; chorus expansion";
    default:
      return "verse density vs chorus lift; keep the hook clear";
  }
}

export function inferArrangementDNA(args: {
  composition: CompositionDNA;
  sonic: SonicDNA;
  harmony?: HarmonyDNA;
  family: SongDNAGenreFamily;
}): ArrangementDNA {
  const parsed = parseStructureSections(args.composition.structure);
  const sectionsSource =
    parsed.length > 0
      ? parsed
      : [
          { id: "verse-1", label: "Verse 1", role: "verse" as const, index: 0, isFinalPayoff: false },
          { id: "chorus-1", label: "Chorus", role: "chorus" as const, index: 1, isFinalPayoff: false }
        ];

  const energies = mapEnergyCurveToSections(sectionsSource, args.composition.energyCurve, args.family);
  const explicitNumeric = hasExplicitNumericEnergyCurve(args.composition.energyCurve);
  const densityAdjust =
    explicitNumeric ? 0 : args.composition.lineDensity === "sparse" ? -1 : args.composition.lineDensity === "dense" ? 1 : 0;

  const sections: SectionProductionDirection[] = sectionsSource.map((parsedSection, index) => {
    const energy = clampEnergy((energies[index] ?? ROLE_ENERGY[parsedSection.role]) + (parsedSection.role === "verse" ? densityAdjust : 0));
    const vocab = vocabFor(args.family, parsedSection.role);
    const next = sectionsSource[index + 1];
    const vocalStyle = args.composition.vocalStyle.toLowerCase();

    let vocalDirection = vocab ? pickBand(vocab.vocal, energy) : args.sonic.vocalDelivery;
    if (/\bbreathy\b|\bintimate\b|\bwhisper/.test(vocalStyle) && (parsedSection.role === "verse" || parsedSection.role === "intro")) {
      vocalDirection = "intimate dry vocal, intelligibility first";
    }
    if (/\baggressive\b|\bgritty\b|\braspy\b/.test(vocalStyle) && parsedSection.role === "verse") {
      vocalDirection = args.family === "nu-metal" || args.family === "rock" ? "aggressive dry verse vocal" : vocalDirection;
    }

    const section: SectionProductionDirection = {
      id: parsedSection.id,
      sectionType: parsedSection.role,
      label: parsedSection.label,
      energy,
      ...(instrumentationFor(args.sonic, energy, args.family, parsedSection.role)
        ? { instrumentation: instrumentationFor(args.sonic, energy, args.family, parsedSection.role) }
        : {}),
      ...(sanitizeDirection(vocab ? pickBand(vocab.drums, energy) : args.sonic.drumCharacter, args.family)
        ? { drumDirection: sanitizeDirection(vocab ? pickBand(vocab.drums, energy) : args.sonic.drumCharacter, args.family) }
        : {}),
      ...(sanitizeDirection(vocab ? pickBand(vocab.bass, energy) : args.sonic.bassCharacter, args.family)
        ? { bassDirection: sanitizeDirection(vocab ? pickBand(vocab.bass, energy) : args.sonic.bassCharacter, args.family) }
        : {}),
      ...(sanitizeDirection(vocalDirection, args.family) ? { vocalDirection: sanitizeDirection(vocalDirection, args.family) } : {}),
      ...(sanitizeDirection(vocab ? pickBand(vocab.layering, energy) : args.sonic.vocalLayering, args.family)
        ? { vocalLayering: sanitizeDirection(vocab ? pickBand(vocab.layering, energy) : args.sonic.vocalLayering, args.family) }
        : {}),
      ...(harmonicFor(parsedSection.role, args.harmony, args.family)
        ? { harmonicDirection: harmonicFor(parsedSection.role, args.harmony, args.family) }
        : {}),
      ...(sanitizeDirection(vocab ? pickBand(vocab.production, energy) : args.sonic.productionAesthetic, args.family)
        ? { productionDirection: sanitizeDirection(vocab ? pickBand(vocab.production, energy) : args.sonic.productionAesthetic, args.family) }
        : {}),
      ...(sanitizeDirection(vocab ? pickBand(vocab.density, energy) : undefined, args.family)
        ? { density: sanitizeDirection(vocab ? pickBand(vocab.density, energy) : undefined, args.family) }
        : {}),
      ...(sanitizeDirection(vocab ? pickBand(vocab.spatial, energy) : args.sonic.spatialCharacter, args.family)
        ? { spatialDirection: sanitizeDirection(vocab ? pickBand(vocab.spatial, energy) : args.sonic.spatialCharacter, args.family) }
        : {}),
      ...(transitionFor(parsedSection, next, args.family, energy)
        ? { transitionIntoNext: transitionFor(parsedSection, next, args.family, energy) }
        : {})
    };

    const priorityInstructions = sectionInstructions(section);
    if (priorityInstructions.length > 0) section.priorityInstructions = priorityInstructions;
    return section;
  });

  return {
    sections,
    globalArc: globalArcFor(args.family, args.composition.energyCurve, sections),
    transitionStrategy: transitionStrategyFor(args.family)
  };
}

export function formatProductionMapPlainText(arrangement: ArrangementDNA): string {
  const header = [
    arrangement.globalArc ? `Arc: ${arrangement.globalArc}` : undefined,
    arrangement.transitionStrategy ? `Transitions: ${arrangement.transitionStrategy}` : undefined
  ].filter(Boolean);

  const blocks = arrangement.sections.map((section) => {
    const lines = [
      section.label.toUpperCase(),
      section.energy !== undefined ? `Energy: ${section.energy}/10` : undefined,
      section.vocalDirection ? `Vocals: ${section.vocalDirection}` : undefined,
      section.vocalLayering ? `Vocal layers: ${section.vocalLayering}` : undefined,
      section.drumDirection ? `Drums: ${section.drumDirection}` : undefined,
      section.bassDirection ? `Bass: ${section.bassDirection}` : undefined,
      section.density ? `Arrangement: ${section.density}` : undefined,
      section.spatialDirection ? `Space: ${section.spatialDirection}` : undefined,
      section.productionDirection ? `Production: ${section.productionDirection}` : undefined,
      section.transitionIntoNext ? `Transition: ${section.transitionIntoNext}` : undefined
    ].filter(Boolean);
    return lines.join("\n");
  });

  return [...header, ...blocks].filter(Boolean).join("\n\n");
}

export function formatArrangementDNAPlainText(arrangement: ArrangementDNA): string {
  return formatProductionMapPlainText(arrangement);
}
