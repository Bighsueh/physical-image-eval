import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

/**
 * Guided tour for the review workspace (driver.js). It is *supplementary* — the UI is built to be
 * self-explanatory without it (inline purpose blurbs, labels, "正在評：圖 N", keyboard hints). The
 * tour just orients a first-time reviewer. Steps target `data-tour="…"` anchors in the workspace.
 */
export const REVIEW_TOUR_SEEN_KEY = 'pie_review_tour_seen_v1';

export function startReviewTour(): void {
  driver({
    showProgress: true,
    allowClose: true,
    overlayColor: '#3F4A33',
    nextBtnText: '下一步',
    prevBtnText: '上一步',
    doneBtnText: '開始審查',
    progressText: '{{current}} / {{total}}',
    steps: [
      {
        element: '[data-tour="left-intro"]',
        popover: {
          title: '左側：受審圖與企劃（唯讀）',
          description: '這裡是要審查的圖與藍圖文字。一邊對照它，一邊在右側填寫你的判定。',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-tour="image"]',
        popover: {
          title: '點圖放大預覽',
          description: '點擊圖片可全螢幕預覽，細看四格的文字、秒數與箭頭；按 Esc 或點背景關閉。',
        },
      },
      {
        element: '[data-tour="storyboard"]',
        popover: {
          title: '需要時展開分鏡',
          description: '點開可看每一格的步驟名、動作說明、時間提示與畫面描述。',
        },
      },
      {
        element: '[data-tour="judgement"]',
        popover: {
          title: '① 先給整體判定（必填）',
          description: '通過／需小修／需重做。鍵盤可直接按 1、2、3 快速選擇。',
        },
      },
      {
        element: '[data-tour="panel-switcher"]',
        popover: {
          title: '② 逐格檢查（圖1～圖4＝左上/右上/左下/右下）',
          description: '每一格請勾「此分格無問題」或標注問題；都沒問題可按「全部標示無問題」。提交前四格都要處理。',
        },
      },
      {
        element: '[data-tour="submit"]',
        popover: {
          title: '③ 提交，自動跳下一張',
          description: '按「提交」或鍵盤 Ctrl／⌘＋Enter；草稿會自動儲存，下次回來自動還原。',
        },
      },
    ],
  }).drive();
}
