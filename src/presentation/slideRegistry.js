import TitleSlide from './slides/TitleSlide.vue'
import ContentSlide from './slides/ContentSlide.vue'
import ClosingSlide from './slides/ClosingSlide.vue'

// JSONの文字列をコードやimportパスとして評価しない。
const registry = Object.freeze({ TitleSlide, ContentSlide, ClosingSlide })
export const resolveSlide = key => Object.hasOwn(registry, key) ? registry[key] : null
