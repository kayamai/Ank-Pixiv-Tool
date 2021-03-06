"use strict";

class AnkTinami extends AnkSite {
  /**
   * コンストラクタ
   */
  constructor () {
    super();

    this.SITE_ID = 'TNM';
  }

  /**
   * 利用するクエリのまとめ
   * @param doc
   */
  getElements (doc) {

    const SELECTOR_ITEMS = {
      "illust": {
        "imgOvr": {"s": ".viewbody"},
        "med": {
          "img": {"s": ".viewbody .captify"}
        },
        "mng": {
          "imgs": {"ALL": ".viewbody img"}
        }
      },
      "info": {
        "illust": {
          "datetime": {"s": ".view_info"},
          "title": {"s": ".viewdata > h1 > span"},

          "captions": {"ALL": ".description"},
          "tags": {"ALL": ".tag > span"}
        },
        "member": {
          "memberLink": {"s": ".prof > p > a"}
        }
      },
      "misc": {
        "openCantion": {"s": "#show_all"},
        "downloadedDisplayParent": {"s": ".viewdata"},

        "postParams": {"ALL": "#open_original_content > input"},

        "downloadedFilenameArea": {"s": ".ank-pixiv-downloaded-filename-text"},
        "nextLink": {"s": ".mvnext > a"},
        "prevLink": {"s": ".mvprev > a"}
      }
    };

    let selectors = this.attachSelectorOverride({}, SELECTOR_ITEMS);

    let gElms = this.initSelectors({'doc': doc}, selectors, doc);

    return gElms;
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
     * @returns {Promise}
     */
    let getPathContext = async (elm) => {
      let getMngPath = async () => {
        let m = Array.prototype.map.call(elm.illust.mng.imgs, (e) => {
          return {'src': e.src};
        });

        return {
          'thumbnail': m,
          'original': m
        }
      };

      let getMedPath = async () => {
        let params = Array.prototype.map.call(elm.misc.postParams, (e) => {
          return [e.getAttribute('name'), e.getAttribute('value')].join('=');
        }).join('&');
        let respMed = await remote.post({
          'url': elm.doc.location.href,
          'body': params,
          'timeout': this.prefs.xhrTimeout,
          'responseType': 'document'
        });


        let docMed = respMed.document;

        let m = Array.prototype.filter.call(docMed.querySelectorAll('img'), (e) => /^https?:\/\/img\.tinami\.com\/illust\d*\/img\//.test(e.src))
          .map((e) => {
            return {'src': e.src};
          });

        return {
          'thumbnail': m,
          'original': m
        }
      };

      if (elm.illust.med.img) {
        return getMedPath();
      }
      if (elm.illust.mng.imgs) {
        return getMngPath();
      }
    };

    /**
     * ダウンロード情報（イラスト情報）の取得
     * @param elm
     * @returns {{url: string, id: *, title: (*|string|XML|void|string), posted: (boolean|*|Number), postedYMD: (boolean|string|*), tags: *, caption: string, R18: boolean}}
     */
    let getIllustContext = (elm) => {
      try {
        let posted = this.getPosted(() => AnkUtils.decodeTextToDateData(elm.info.illust.datetime.textContent));

        let info = {
          'url': elm.doc.location.href,
          'id': this.getIllustId(elm.doc.location.href),
          'title': AnkUtils.trim(elm.info.illust.title.textContent),
          'posted': !posted.fault && posted.timestamp,
          'postedYMD': !posted.fault && posted.ymd,
          'tags': Array.prototype.map.call(elm.info.illust.tags, (e) => AnkUtils.trim(e.textContent)),
          'caption': Array.prototype.map.call(elm.info.illust.captions, (e) =>AnkUtils.trim(e.textContent)).join('\n'),
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
          'id': /\/profile\/(.+)(?:\?|$)/.exec(elm.info.member.memberLink.href)[1],
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

    if (mode & this.GET_CONTEXT.PATH) {
      context.path = await getPathContext(elm);
    }
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
    return (/www\.tinami\.com\/view\/([^/]+?)(?:\?|$)/.exec(loc) || [])[1];
  }

  /**
   * サムネイルにダウンロード済みマークを付ける
   * @returns {{queries: [*,*,*], getId: (function(*=)), getLastUpdate: undefined, method: undefined}}
   */
  getMarkingRules () {

    const MARKING_TARGETS = [
      { 'q':'td > p.capt + a', 'n':1},                              // 一覧
      { 'q':'td > .title > .collection_form_checkbox + a', 'n':2},  // コレクション
      { 'q':'.thumbs > li > ul > li > a', 'n':1}                    // 最近の投稿作品
    ];

    return {
      'queries': MARKING_TARGETS,
      'getId': (href) => {
        return this.getIllustId(href);
      },
      'getLastUpdate': undefined,
      'method': undefined
    };
  }

  /**
   * 機能のインストール（イラストページ用）
   */
  installIllustPageFunction (RETRY_VALUE) {
    // 中画像クリック関連
    let middleClickEventFunc = () => {
      let addMiddleClickEventListener = (imgOvr) => {
        let mcHandler = (e) => {
          let useEvent = this.prefs.site.largeOnMiddle || this.prefs.site.downloadWhenClickMiddle;
          let useCapture = this.prefs.site.largeOnMiddle;
          if (!useEvent) {
            return;
          }

          if (this.prefs.site.largeOnMiddle) {
            this.openViewer();
          }

          if (this.prefs.site.downloadWhenClickMiddle) {
            // 自動ダウンロード（中画像クリック時）
            this.downloadCurrentImage({'autoDownload': true});
          }

          if (useCapture) {
            e.preventDefault();
            e.stopPropagation();
          }
        };

        imgOvr.addEventListener('click', mcHandler, true);
      };

      //

      // オーバーレイ
      let imgOvr = this.elements.illust.imgOvr;
      if (!imgOvr) {
        return;
      }

      let result = (() => {
        // イラスト
        let img = this.elements.illust.med.img || this.elements.illust.mng.imgs;
        if (img) {
          addMiddleClickEventListener(imgOvr);
          return true;
        }
      })();

      return result;
    };

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

    // キャプションを自動で開く
    let openCaption = () => {
      if (!this.prefs.openCaption) {
        return true;
      }

      let button = this.elements.misc.openCantion;
      if (!button) {
        return;
      }

      setTimeout(() => {
        if (getComputedStyle(button).getPropertyValue('display') === 'block') {
          button.click();
        }
      }, this.prefs.openCaptionDelay);

      return true;
    };

    //

    Promise.all([
      AnkUtils.delayFunctionInstaller({'func': middleClickEventFunc, 'retry': RETRY_VALUE, 'label': 'middleClickEventFunc'}),
      AnkUtils.delayFunctionInstaller({'func': delayDisplaying, 'retry': RETRY_VALUE, 'label': 'delayDisplaying'}),
      AnkUtils.delayFunctionInstaller({'func': delayMarking, 'retry': RETRY_VALUE, 'label': 'delayMarking'}),
      AnkUtils.delayFunctionInstaller({'func': openCaption, 'retry': RETRY_VALUE, 'label': 'openCaption'})
    ])
      .catch((e) => logger.warn(e));
  }

  /**
   * 機能のインストール（リストページ用）
   */
  installListPageFunction (RETRY_VALUE) {

    // サムネイルにダウンロード済みマークを表示する
    let delayMarking = () => {
      if (this.elements.doc.readyState !== "complete") {
        return false;
      }

      this.markDownloaded().then();
      return true;
    };

    Promise.all([
      AnkUtils.delayFunctionInstaller({'func': delayMarking, 'retry': RETRY_VALUE, 'label': 'delayMarking'})
    ])
      .catch((e) => logger.error(e));
  }

  /**
   * 機能のインストールのまとめ
   */
  installFunctions () {
    if (this.inIllustPage()) {
      this.installIllustPageFunction(this.FUNC_INST_RETRY_VALUE);
      return;
    }

    this.installListPageFunction(this.FUNC_INST_RETRY_VALUE);
  }

}

// 開始

new AnkTinami().start()
  .catch((e) => {
    console.error(e);
  });
