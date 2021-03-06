"use strict";

class AnkDeviantart extends AnkSite {
  /**
   * コンストラクタ
   */
  constructor () {
    super();

    this.SITE_ID = 'dART';

    this.USE_CONTEXT_CACHE = false;
  }

  /**
   * 利用するクエリのまとめ
   * - Override Selector は使えません
   * @param doc
   */
  getElements (doc) {

    let miniBrowse = null;

    let query = (s) => {
      miniBrowse = miniBrowse || doc.querySelector('.minibrowse-container.dev-page-container');
      if (miniBrowse) {
        return miniBrowse.querySelector(s);
      }
      return doc.querySelector(s);
    };

    let queryAll = (s) => {
      miniBrowse = miniBrowse || doc.querySelector('.minibrowse-container.dev-page-container');
      if (miniBrowse) {
        return miniBrowse.querySelectorAll(s);
      }
      return doc.querySelectorAll(s);
    };

    return {
      'illust': {
        'med': {
          get img () {
            return query('.dev-view-deviation .dev-content-normal');
          },
          get bigImg () {
            return query('.dev-view-deviation .dev-content-full')
          }
        }
      },
      'info': {
        'illust': {
          get datetime () {
            return query('.dev-metainfo-content.dev-metainfo-details > dl > dd > span');
          },
          get title () {
            return query('.dev-title-container h1 > a');
          },
          get caption () {
            return query('.dev-description .text.block');
          },

          get tags () {
            return queryAll('.dev-title-container .dev-about-breadcrumb a');
          }
        },
        'member': {
          get memberLink () {
            return query('.dev-title-container .author .username');
          }
        }
      },
      'misc': {
        get content () {
          return doc.querySelector('body');
        },
        get miniBrowse () {
          return miniBrowse;
        },
        get downloadedDisplayParent () {
          return query('.dev-title-container');
        },
        get downloadedFilenameArea () {
          return query('.ank-pixiv-downloaded-filename-text');
        }
      },
      'doc': doc
    };
  }

  /**
   *
   * @param doc
   * @returns {boolean}
   */
  inIllustPage (doc) {
    doc = doc || document;
    return !!this.getIllustId(doc.location.href);
  }

  /**
   *
   * @param elm
   * @param mode
   * @returns {Promise.<{}>}
   */
  async getAnyContext (elm, mode) {

    /**
     * ダウンロード情報（画像パス）の取得
     * @param elm
     * @returns {{thumbnail, original}}
     */
    let getPathContext = (elm) => {
      let getMedPath = () => {
        return {
          'thumbnail': [{'src': elm.illust.med.img.src}],
          'original': [{'src': elm.illust.med.bigImg.src}]
        }
      };

      if (elm.illust.med.img) {
        return getMedPath();
      }
    };

    /**
     * ダウンロード情報（イラスト情報）の取得
     * @param elm
     * @returns {{url, id: *, title: (*|string|XML|void|string), posted: (boolean|*|Number), postedYMD: (boolean|string|*), tags: *, caption: (*|SELECTOR_ITEMS.info.illust.caption|{s}|*|string|XML|void|string), R18: boolean}}
     */
    let getIllustContext = (elm) => {
      try {
        let dd = new Date(parseInt(elm.info.illust.datetime.getAttribute('ts'),10) * 1000);
        let posted = this.getPosted(() => AnkUtils.getDateData(dd));

        let info = {
          'url': elm.info.illust.title.href,
          'id': this.getIllustId(elm.info.illust.title.href),
          'title': AnkUtils.trim(elm.info.illust.title.textContent),
          'posted': !posted.fault && posted.timestamp,
          'postedYMD': !posted.fault && posted.ymd,
          'tags': Array.prototype.map.call(elm.info.illust.tags, (e) => AnkUtils.trim(e.textContent).replace(/^#/, '')),
          'caption': elm.info.illust.caption && AnkUtils.trim(elm.info.illust.caption.textContent),
          'R18': false
        };

        return info;
      }
      catch (e) {
        logger.error(e);
      }
    };

    /**
     * ダウンロード情報（メンバー情報）の取得
     * @param elm
     * @returns {{id: *, name: (*|string|XML|void|string), pixiv_id: null, memoized_name: null}}
     */
    let getMemberContext = (elm) => {
      try {
        return {
          'id': /^https?:\/\/www\.deviantart\.com\/([^/]+?)(?:\?|$)/.exec(elm.info.member.memberLink.href)[1],
          'name': AnkUtils.trim(elm.info.member.memberLink.textContent),
          'pixiv_id': null,
          'memoized_name': null
        };
      }
      catch (e) {
        logger.error(e);
      }
    };

    //

    let context = {};

    context.path = getPathContext(elm);
    context.illust = getIllustContext(elm);
    context.member = getMemberContext(elm);

    return context;
  }

  /**
   * イラストIDの取得
   * @param loc
   * @returns {*}
   */
  getIllustId (loc) {
    return (/^https?:\/\/www\.deviantart\.com\/[^/]+?\/art\/(.+?)(?:\?|$)/.exec(loc) || [])[1];
  }

  /**
   * サムネイルにダウンロード済みマークを付ける
   * @returns {{node: *, queries: [*,*,*], getId: (function(*=)), getLastUpdate: undefined, method: string}}
   */
  getMarkingRules () {

    const MARKING_TARGETS = [
      /*
      { 'q':'.dev-page-container .thumb > a', 'n':1 },
      { 'q':'.feed-action-content a.thumb', 'n':1 },
      { 'q':'#gmi-GZone .gr-body a', 'n':2 },
      { 'q':'#gmi- span.thumb > a', 'n':1 },
      { 'q':'.grid-thumb a.thumb', 'n':2 }
      */
      { 'q': '.torpedo-thumb-link', 'n': 1 },
      { 'q': 'a.thumb', 'n': 1 },
      { 'q': '.thumb > a', 'n': 1 }
    ];

    return {
      'node': this.elements.misc.miniBrowse,
      'queries': MARKING_TARGETS,
      'getId': (href) => {
        return this.getIllustId(href);
      },
      'getLastUpdate': undefined,
      'method': 'border'
    };
  }

  /**
   * 機能のインストール
   */
  installFunctions () {

    // 「保存済み」を表示する
    let delayDisplaying = () => {
      if (this.elements.doc.readyState !== "complete") {
        return false;
      }

      this.displayDownloaded().then();
      return true;
    };

    // イメレスのサムネイルにダウンロード済みマークを表示する
    let delayMarking = () => {
      if (this.elements.doc.readyState !== "complete") {
        return false;
      }

      this.markDownloaded().then();
      return true;
    };

    // ajaxによるコンテンツの入れ替えを検出する
    let detectContentChange = () => {
      if (this.elements.doc.readyState !== "complete") {
        return false;   // リトライしてほしい
      }

      let content = this.elements.misc.content;
      if (!content) {
        return false;   // リトライしてほしい
      }

      let miniBrowse = null;

      // miniBrowseの中身が書き換わるのを検出する
      let moBrowse = new MutationObserver((o) => {
        let rise = false;
        o.forEach((a) => {
          Array.prototype.forEach.call(a.addedNodes, (e) => {
            if (e.classList) {
              if (e.classList.contains('dev-title-container')) {
                rise = true;
              }
            }
          });
        });
        if (rise) {
          this.resetElements();
          this.resetCondition();
          this.forceDisplayAndMarkDownloaded();
        }
      });

      // miniBrowseが開くのを検出する
      let moBody = new MutationObserver((o) => {
        let rise = false;
        o.forEach((a) => {
          Array.prototype.forEach.call(a.addedNodes, (e) => {
            if (e.classList) {
              if (e.classList.contains('dev-title-container')) {
                rise = true;
              }
              if (e.classList.contains('minibrowse-container')) {
                miniBrowse = e;
              }
            }
          });
        });
        if (miniBrowse && rise) {
          this.resetElements();
          this.resetCondition();
          this.forceDisplayAndMarkDownloaded();
          moBody.disconnect();
          moBrowse.observe(miniBrowse, {'childList': true, 'subtree': true});
        }
      });

      moBody.observe(content, {'childList': true, 'subtree': true});

      return true;
    };

    Promise.all([
      AnkUtils.delayFunctionInstaller({'func': delayDisplaying, 'retry': this.FUNC_INST_RETRY_VALUE, 'label': 'delayDisplaying'}),
      AnkUtils.delayFunctionInstaller({'func': delayMarking, 'retry': this.FUNC_INST_RETRY_VALUE, 'label': 'delayMarking'}),
      AnkUtils.delayFunctionInstaller({'func': detectContentChange, 'retry': this.FUNC_INST_RETRY_VALUE, 'label': 'detectContentChange'})
    ])
      .catch((e) => logger.warn(e));
  }

}

// 開始

new AnkDeviantart().start()
  .catch((e) => {
    console.error(e);
  });
