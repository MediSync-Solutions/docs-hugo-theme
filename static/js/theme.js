window.relearn = window.relearn || {};

var theme = true;
var isIE = /*@cc_on!@*/false || !!document.documentMode;
if( isIE ){
    // we don't support sidebar flyout in IE
    document.querySelector( 'body' ).classList.remove( 'mobile-support' );
}
else{
    document.querySelector( 'body' ).classList.add( 'mobile-support' );
}

var isPrint = document.querySelector( 'body' ).classList.contains( 'print' );

var isRtl = document.querySelector( 'html' ).getAttribute( 'dir' ) == 'rtl';
var lang = document.querySelector( 'html' ).getAttribute( 'lang' );
var dir_padding_start = 'padding-left';
var dir_padding_end = 'padding-right';
var dir_key_start = 37;
var dir_key_end = 39;
var dir_scroll = 1;
if( isRtl && !isIE ){
    dir_padding_start = 'padding-right';
    dir_padding_end = 'padding-left';
    dir_key_start = 39;
    dir_key_end = 37;
    dir_scroll = -1;
}

var touchsupport = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0)

var formelements = 'button, datalist, fieldset, input, label, legend, meter, optgroup, option, output, progress, select, textarea';

var pst = new Map();
var elc = document.querySelector('#R-body-inner');

function regexEscape( s ){
    return s.replace( /[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&' );
}

function documentFocus(){
    elc.focus();
}


function fixCodeTabs(){
    /* if only a single code block is contained in the tab and no style was selected, treat it like style=code */
    var codeTabContents = Array.from( document.querySelectorAll( '.tab-content.tab-panel-style' ) ).filter( function( tabContent ){
        return tabContent.querySelector( '*:scope > .tab-content-text > div.highlight:only-child, *:scope > .tab-content-text > pre:not(.mermaid).pre-code:only-child');
    });

    codeTabContents.forEach( function( tabContent ){
        var tabId = tabContent.dataset.tabItem;
        var tabPanel = tabContent.parentNode.parentNode;
        var tabButton = tabPanel.querySelector( '.tab-nav-button.tab-panel-style[data-tab-item="'+tabId+'"]' );
        if( tabContent.classList.contains( 'initial' ) ){
            tabButton.classList.remove( 'initial' );
            tabButton.classList.add( 'code' );
            tabContent.classList.remove( 'initial' );
            tabContent.classList.add( 'code' );
        }
        // mark code blocks for FF without :has()
        tabContent.classList.add( 'codify' );
    });
}

function switchTab(tabGroup, tabId) {
    var tabs = Array.from( document.querySelectorAll( '.tab-panel[data-tab-group="'+tabGroup+'"]' ) ).filter( function( e ){
        return !!e.querySelector( '[data-tab-item="'+tabId+'"]' );
    });
    var allTabItems = tabs && tabs.reduce( function( a, e ){
        return a.concat( Array.from( e.querySelectorAll( '[data-tab-item]' ) ).filter( function( es ){
            return es.parentNode.parentNode == e;
        }) );
    }, [] );
    var targetTabItems = tabs && tabs.reduce( function( a, e ){
        return a.concat( Array.from( e.querySelectorAll( '[data-tab-item="'+tabId+'"]' ) ).filter( function( es ){
            return es.parentNode.parentNode == e;
        }) );
    }, [] );

    // if event is undefined then switchTab was called from restoreTabSelection
    // so it's not a button event and we don't need to safe the selction or
    // prevent page jump
    var isButtonEvent = event && event.target && event.target.getBoundingClientRect;
    if(isButtonEvent){
      // save button position relative to viewport
      var yposButton = event.target.getBoundingClientRect().top;
    }

    allTabItems && allTabItems.forEach( function( e ){ e.classList.remove( 'active' ); });
    targetTabItems && targetTabItems.forEach( function( e ){ e.classList.add( 'active' ); });

    if(isButtonEvent){
      initMermaid( true );

      // reset screen to the same position relative to clicked button to prevent page jump
      var yposButtonDiff = event.target.getBoundingClientRect().top - yposButton;
      window.scrollTo(window.scrollX, window.scrollY+yposButtonDiff);

      // Store the selection to make it persistent
      if(window.localStorage){
          var selectionsJSON = window.localStorage.getItem(baseUriFull+"tab-selections");
          if(selectionsJSON){
            var tabSelections = JSON.parse(selectionsJSON);
          }else{
            var tabSelections = {};
          }
          tabSelections[tabGroup] = tabId;
          window.localStorage.setItem(baseUriFull+"tab-selections", JSON.stringify(tabSelections));
      }
    }
}

function restoreTabSelections() {
    if(window.localStorage){
        var selectionsJSON = window.localStorage.getItem(baseUriFull+"tab-selections");
        if(selectionsJSON){
          var tabSelections = JSON.parse(selectionsJSON);
        }else{
          var tabSelections = {};
        }
        Object.keys(tabSelections).forEach(function(tabGroup) {
          var tabItem = tabSelections[tabGroup];
          switchTab(tabGroup, tabItem);
        });
    }
}

function initMermaid( update, attrs ) {
    var doBeside = true;
    var isImageRtl = false;

    // we are either in update or initialization mode;
    // during initialization, we want to edit the DOM;
    // during update we only want to execute if something changed
    var decodeHTML = function( html ){
        var txt = document.createElement( 'textarea' );
        txt.innerHTML = html;
        return txt.value;
    };

    var parseGraph = function( graph ){
        // See https://github.com/mermaid-js/mermaid/blob/9a080bb975b03b2b1d4ef6b7927d09e6b6b62760/packages/mermaid/src/diagram-api/frontmatter.ts#L10
        // for reference on the regex originally taken from jekyll
        var YAML=1;
        var INIT=2;
        var GRAPH=3;
        var d = /^(?:\s*[\n\r])*(?:-{3}(\s*[\n\r](?:.*?)[\n\r])-{3}(?:\s*[\n\r]+)+)?(?:\s*(?:%%\s*\{\s*\w+\s*:([^%]*?)%%\s*[\n\r]?))?(.*)$/s
        var m = d.exec( graph );
        var yaml = {};
        var dir = {};
        var content = graph;
        if( m && m.length == 4 ){
            yaml = m[YAML] ? jsyaml.load( m[YAML] ) : yaml;
            dir = m[INIT] ? JSON.parse( '{ "init": ' + m[INIT] ).init : dir;
            content = m[GRAPH] ? m[GRAPH] : content;
        }
        var ret = { yaml: yaml, dir: dir, content: content.trim() }
        return ret;
    };

    var serializeGraph = function( graph ){
        var yamlPart = '';
        if( Object.keys( graph.yaml ).length ){
            yamlPart = '---\n' + jsyaml.dump( graph.yaml ) + '---\n';
        }
        var dirPart = '';
        if( Object.keys( graph.dir ).length ){
            dirPart = '%%{init: ' + JSON.stringify( graph.dir ) + '}%%\n';
        }
        return yamlPart + dirPart + graph.content;
    };

    var init_func = function( attrs ){
        var is_initialized = false;
        var theme = attrs.theme;
        document.querySelectorAll('.mermaid').forEach( function( element ){
            var parse = parseGraph( decodeHTML( element.innerHTML ) );

            if( parse.yaml.theme ){
                parse.yaml.relearn_user_theme = true;
            }
            if( parse.dir.theme ){
                parse.dir.relearn_user_theme = true;
            }
            if( !parse.yaml.relearn_user_theme && !parse.dir.relearn_user_theme ){
                parse.yaml.theme = theme;
            }
            is_initialized = true;

            var graph = serializeGraph( parse );
            element.innerHTML = graph;
            if( element.offsetParent !== null ){
                element.classList.add( 'mermaid-render' );
            }
            var new_element = document.createElement( 'div' );
            new_element.classList.add( 'mermaid-container' );
            if( element.classList.contains( 'align-right' ) ){
                new_element.classList.add( 'align-right' );
                element.classList.remove( 'align-right' );
            }
            if( element.classList.contains( 'align-center' ) ){
                new_element.classList.add( 'align-center' );
                element.classList.remove( 'align-center' );
            }
            if( element.classList.contains( 'align-left' ) ){
                new_element.classList.add( 'align-left' );
                element.classList.remove( 'align-left' );
            }
            new_element.innerHTML = '<div class="mermaid-code">' + graph + '</div>' + element.outerHTML;
            element.parentNode.replaceChild( new_element, element );
        });
        return is_initialized;
    }

    var update_func = function( attrs ){
        var is_initialized = false;
        var theme = attrs.theme;
        document.querySelectorAll( '.mermaid-container' ).forEach( function( e ){
            var element = e.querySelector( '.mermaid' );
            var code = e.querySelector( '.mermaid-code' );
            var parse = parseGraph( decodeHTML( code.innerHTML ) );

            if( element.classList.contains( 'mermaid-render' ) ){
                if( parse.yaml.relearn_user_theme || parse.dir.relearn_user_theme ){
                    return;
                }
                if( parse.yaml.theme == theme || parse.dir.theme == theme ){
                    return;
                }
            }
            if( element.offsetParent !== null ){
                element.classList.add( 'mermaid-render' );
            }
            else{
                element.classList.remove( 'mermaid-render' );
                return;
            }
            is_initialized = true;

            parse.yaml.theme = theme;
            var graph = serializeGraph( parse );
            element.removeAttribute('data-processed');
            element.innerHTML = graph;
            code.innerHTML = graph;
        });
        return is_initialized;
    };

    var state = this;
    if( update && !state.is_initialized ){
        return;
    }
    if( typeof variants == 'undefined' ){
        return;
    }
    if( typeof mermaid == 'undefined' || typeof mermaid.mermaidAPI == 'undefined' ){
        return;
    }

    if( !state.is_initialized ){
        state.is_initialized = true;
        window.addEventListener( 'beforeprint', function(){
            initMermaid( true, {
                'theme': variants.getColorValue( 'PRINT-MERMAID-theme' ),
            });
		}.bind( this ) );
		window.addEventListener( 'afterprint', function(){
            initMermaid( true );
		}.bind( this ) );
    }

    attrs = attrs || {
        'theme': variants.getColorValue( 'MERMAID-theme' ),
    };

    var search;
    if( update ){
        search = sessionStorage.getItem( baseUriFull+'search-value' );
        unmark();
    }
    var is_initialized = ( update ? update_func( attrs ) : init_func( attrs ) );
    if( is_initialized ){
        mermaid.initialize( Object.assign( { "securityLevel": "antiscript", "startOnLoad": false }, window.relearn.mermaidConfig, { theme: attrs.theme } ) );
        mermaid.run({
            postRenderCallback: function( id ){
                // zoom for Mermaid
                // https://github.com/mermaid-js/mermaid/issues/1860#issuecomment-1345440607
                var svgs = d3.selectAll( 'body:not(.print) .mermaid.zoom > #' + id );
                svgs.each( function(){
                    var parent = this.parentElement;
                    // we need to copy the maxWidth, otherwise our reset button will not align in the upper right
                    parent.style.maxWidth = this.style.maxWidth || this.getAttribute( 'width' );
                    // if no unit is given for the width
                    parent.style.maxWidth = parent.style.maxWidth || 'calc( ' + this.getAttribute( 'width' ) + 'px + 1rem )';
                    var svg = d3.select( this );
                    svg.html( '<g>' + svg.html() + '</g>' );
                    var inner = svg.select( '*:scope > g' );
                    parent.insertAdjacentHTML( 'beforeend', '<span class="svg-reset-button" title="' + window.T_Reset_view + '"><i class="fas fa-undo-alt"></i></span>' );
                    var button = parent.querySelector( '.svg-reset-button' );
                    var zoom = d3.zoom().on( 'zoom', function( e ){
                        inner.attr( 'transform', e.transform );
                        button.classList.add( "zoom" );
                    });
                    button.addEventListener( 'click', function( event ){
                        svg.transition()
                            .duration( 350 )
                            .call( zoom.transform, d3.zoomIdentity );
                        this.setAttribute( 'aria-label', window.T_View_reset );
                        this.classList.add( 'tooltipped', 'tooltipped-' + (doBeside ? 'w' : 's'+(isImageRtl?'e':'w')) );
                    });
                    button.addEventListener( 'mouseleave', function() {
                        this.removeAttribute( 'aria-label' );
                        if( this.classList.contains( 'tooltipped' ) ){
                            this.classList.remove( 'tooltipped', 'tooltipped-w', 'tooltipped-se', 'tooltipped-sw' );
                            this.classList.remove( "zoom" );
                        }
                    });
                    svg.call( zoom );
                });
            },
            querySelector: '.mermaid.mermaid-render',
            suppressErrors: true
        });
    }
    if( update && search && search.length ){
        sessionStorage.setItem( baseUriFull+'search-value', search );
        mark();
    }
}

function initOpenapi( update, attrs ){
    if( isIE ){
        return;
    }

    var state = this;
    if( update && !state.is_initialized ){
        return;
    }
    if( typeof variants == 'undefined' ){
        return;
    }

    if( !state.is_initialized ){
        state.is_initialized = true;
        window.addEventListener( 'beforeprint', function(){
            initOpenapi( true, { isPrintPreview: true } );
        }.bind( this ) );
        window.addEventListener( 'afterprint', function(){
            initOpenapi( true, { isPrintPreview: false } );
        }.bind( this ) );
    }

    attrs = attrs || {
        isPrintPreview: false
    };

    function addFunctionToResizeEvent(){

    }
    function getFirstAncestorByClass(){

    }
    function renderOpenAPI(oc) {
        var buster = window.themeUseOpenapi.assetsBuster ? '?' + window.themeUseOpenapi.assetsBuster : '';
        var print = isPrint || attrs.isPrintPreview ? "PRINT-" : "";
		var theme = print ? `${baseUri}/css/theme-light.css` : document.querySelector( '#R-variant-style' ).attributes.href.value
        var swagger_theme = variants.getColorValue( print + 'OPENAPI-theme' );
        var swagger_code_theme = variants.getColorValue( print + 'OPENAPI-CODE-theme' );

        const openapiId = 'relearn-swagger-ui';
        const openapiIframeId = openapiId + "-iframe";
        const openapiIframe = document.getElementById(openapiIframeId);
        if (openapiIframe) {
            openapiIframe.remove();
        }
        const openapiErrorId = openapiId + '-error';
        const openapiError = document.getElementById(openapiErrorId);
        if (openapiError) {
            openapiError.remove();
        }
        const oi = document.createElement('iframe');
        oi.id = openapiIframeId;
        oi.classList.toggle('sc-openapi-iframe', true);
        oi.srcdoc =
            '<!doctype html>' +
            '<html lang="' + lang + '" dir="' + (isRtl ? 'rtl' : 'ltr') + '">' +
                '<head>' +
                    '<link rel="stylesheet" href="' + window.themeUseOpenapi.css + '">' +
                    '<link rel="stylesheet" href="' + theme + '">' +
                    '<link rel="stylesheet" href="' + baseUri + '/css/swagger.css' + buster + '">' +
                    '<link rel="stylesheet" href="' + baseUri + '/css/swagger-' + swagger_theme + '.css' + buster + '">' +
                '</head>' +
                '<body>' +
                    '<a class="relearn-expander" href="" onclick="return relearn_collapse_all()">Collapse all</a>' +
                    '<a class="relearn-expander" href="" onclick="return relearn_expand_all()">Expand all</a>' +
                    '<div id="relearn-swagger-ui"></div>' +
                    '<script>' +
                        'function relearn_expand_all(){' +
                            'document.querySelectorAll( ".opblock-summary-control[aria-expanded=false]" ).forEach( btn => btn.click() );' +
                            'document.querySelectorAll( ".model-container > .model-box > button[aria-expanded=false]" ).forEach( btn => btn.click() );' +
                            'return false;' +
                        '}' +
                        'function relearn_collapse_all(){' +
                            'document.querySelectorAll( ".opblock-summary-control[aria-expanded=true]" ).forEach( btn => btn.click() );' +
                            'document.querySelectorAll( ".model-container > .model-box > .model-box > .model > span > button[aria-expanded=true]" ).forEach( btn => btn.click() );' +
                            'return false;' +
                        '}' +
                    '</script>' +
                '</body>' +
            '</html>';
        oi.height = '100%';
        oi.width = '100%';
        oi.onload = function(){
            const openapiWrapper = getFirstAncestorByClass(oc, 'sc-openapi-wrapper');
            const openapiPromise = new Promise( function(resolve){ resolve() });
            openapiPromise
                .then( function(){
                    SwaggerUIBundle({
                        defaultModelsExpandDepth: 2,
                        defaultModelExpandDepth: 2,
                        docExpansion: isPrint || attrs.isPrintPreview ? 'full' : 'list',
                        domNode: oi.contentWindow.document.getElementById(openapiId),
                        filter: !( isPrint || attrs.isPrintPreview ),
                        layout: 'BaseLayout',
                        onComplete: function(){
                            if( isPrint || attrs.isPrintPreview ){
                                oi.contentWindow.document.querySelectorAll( '.model-container > .model-box > button[aria-expanded=false]' ).forEach( function(btn){ btn.click() });
                                setOpenAPIHeight(oi);
                            }
                        },
                        plugins: [
                            SwaggerUIBundle.plugins.DownloadUrl
                        ],
                        presets: [
                            SwaggerUIBundle.presets.apis,
                            SwaggerUIStandalonePreset,
                        ],
                        syntaxHighlight: {
                            activated: true,
                            theme: swagger_code_theme,
                        },
                        url: oc.dataset.openapiUrl,
                        validatorUrl: 'none',
                    });
                })
                .then( function(){
                    let observerCallback = function () {
                        setOpenAPIHeight(oi);
                    };
                    let observer = new MutationObserver(observerCallback);
                    observer.observe(oi.contentWindow.document.documentElement, {
                        childList: true,
                        subtree: true,
                    });
                })
                .then( function(){
                    if (openapiWrapper) {
                        openapiWrapper.classList.toggle('is-loading', false);
                    }
                    setOpenAPIHeight(oi);
                })
                .catch( function(error){
                    const ed = document.createElement('div');
                    ed.classList.add('sc-alert', 'sc-alert-error');
                    ed.innerHTML = error;
                    ed.id = openapiErrorId;
                    while (oc.lastChild) {
                        oc.removeChild(oc.lastChild);
                    }
                    if (openapiWrapper) {
                        openapiWrapper.classList.toggle('is-loading', false);
                        openapiWrapper.insertAdjacentElement('afterbegin', ed);
                    }
                });
        };
        oc.appendChild(oi);
    }
    function setOpenAPIHeight(oi) {
        // add empirical offset if in print preview (GC 103)
        oi.style.height =
            (oi.contentWindow.document.documentElement.getBoundingClientRect().height + (attrs.isPrintPreview ? 200 : 0) )+
            'px';
    }
    function resizeOpenAPI() {
        let divi = document.getElementsByClassName('sc-openapi-iframe');
        for (let i = 0; i < divi.length; i++) {
            setOpenAPIHeight(divi[i]);
        }
    };
    let divo = document.getElementsByClassName('sc-openapi-container');
    for (let i = 0; i < divo.length; i++) {
        renderOpenAPI(divo[i]);
    }
    if (divo.length) {
        addFunctionToResizeEvent(resizeOpenAPI);
    }
}

function initAnchorClipboard(){
    document.querySelectorAll( 'h2,h3,h4,h5,h6').forEach( function( element ){
        var url = encodeURI( (document.location.origin == "null" ? (document.location.protocol + "//" + document.location.host) : document.location.origin )+ document.location.pathname);
        var link = url + "#" + element.id;
        var new_element = document.createElement( 'span' );
        new_element.classList.add( 'anchor' );
        new_element.setAttribute( 'title', window.T_Copy_link_to_clipboard );
        new_element.setAttribute( 'data-clipboard-text', link );
        new_element.innerHTML = '<i class="fas fa-link fa-lg"></i>';
        element.appendChild( new_element );
    });
    var clip = new ClipboardJS( '.anchor' );
    clip.on( 'success', function( e ){
        e.clearSelection();
        showNotify(window.window.T_Link_copied_to_clipboard,'<i class="fa-regular fa-clipboard"></i>');
    });
}
function initMedia() {
    document.querySelectorAll(".image-container").forEach(container => {
        let item = container.querySelector("img");
        if (item.complete) {
            container.style.setProperty("aspect-ratio",item.naturalWidth/item.naturalHeight);
            container.style.setProperty("max-width","calc(70vh * " + (item.naturalWidth/item.naturalHeight)+")");
        } else {
            item.addEventListener("load", function () {
                container.style.setProperty("aspect-ratio",item.naturalWidth/item.naturalHeight);
                container.style.setProperty("max-width","calc(70vh * " + (item.naturalWidth/item.naturalHeight)+")");
            });
        }
    });
    document.querySelectorAll(".video-container").forEach(container => {
        let item = container.querySelector("video");
        item.addEventListener("loadedmetadata", function () {
            container.style.setProperty("aspect-ratio",item.videoWidth/item.videoHeight);
            container.style.setProperty("max-width","calc(70vh * " + (item.videoWidth/item.videoHeight)+")");
        });
    });
}
function initCarousels() {
    document.querySelectorAll(".carousel-container").forEach(carousel => {
      let firstItem = carousel.querySelector(".item");
      if (firstItem == null) { carousel.remove(); return; }
      if (firstItem.querySelector("#" + carousel.id + " > " + ".item > img") != null) {
        firstImage = firstItem.querySelector("#" + carousel.id + " > " + ".item > img");
        if (firstImage.complete) {
            carousel.querySelectorAll("#" + carousel.id + " > " + ".item").forEach(item => {
                item.style.setProperty("aspect-ratio",firstImage.naturalWidth/firstImage.naturalHeight);
            });
            carousel.style.setProperty("max-width","calc(70vh * " + (firstImage.naturalWidth/firstImage.naturalHeight)+")");
        } else {
            firstImage.addEventListener("load", function () {
                carousel.querySelectorAll("#" + carousel.id + " > " + ".item").forEach(item => {
                    item.style.setProperty("aspect-ratio",firstImage.naturalWidth/firstImage.naturalHeight);
                });
                
                carousel.style.setProperty("max-width","calc(70vh * " + (firstImage.naturalWidth/firstImage.naturalHeight)+")");
            });
        }
      } else {
        firstVideo = firstItem.querySelector("#" + carousel.id + " > " + ".item > video");
        firstVideo.addEventListener("loadedmetadata", function () {
          carousel.querySelectorAll("#" + carousel.id + " > " + ".item").forEach(item => {
            item.style.setProperty("aspect-ratio",this.videoWidth/this.videoHeight);
          });
          carousel.style.setProperty("max-width","calc(70vh * " + (this.videoWidth/this.videoHeight)+")");
        });
      }

      insertNumbers(carousel);

      carousel.querySelector(".prev").addEventListener("click", e => {
        minusItem(carousel);
      });

      carousel.querySelector(".next").addEventListener("click", () => {
        plusItem(carousel);
      });

      insertDots(carousel);

      carousel.querySelectorAll("#" + carousel.id + " > " + ".dots > .dot").forEach(dot => {
        dot.addEventListener("click", e => {
          let item = Array.prototype.indexOf.call(
          e.target.parentNode.children,
          e.target);
          showItems(carousel, item);
        });
      });
      showItems(carousel, 0);
    });

    function insertNumbers(carousel) {
      const items = carousel.querySelectorAll("#" + carousel.id + " > " + ".item");
      const length = items.length;
      let i = 1;
      items.forEach(item => {
        const number = document.createElement("div");
        number.classList.add("counter");
        number.innerText = i++ + " / " + length;
        item.append(number);
      });
    }

    function insertDots(carousel) {
      const dots = document.createElement("div");
      dots.classList.add("dots");

      carousel.querySelectorAll("#" + carousel.id + " > " + ".item").forEach(elem => {
        const dot = document.createElement("div");
        dot.classList.add("dot");
        dots.append(dot);
      });
      carousel.append(dots);
    }

    function plusItem(carousel) {
      let item = currentItem(carousel);
      let length = carousel.querySelectorAll("#" + carousel.id + " > " + ".item").length;
      if (length < 2) return;
      item < length-1 ? showItems(carousel, item + 1) : showItems(carousel, 0);
    }

    function minusItem(carousel) {
      let item = currentItem(carousel);
      let length = carousel.querySelectorAll("#" + carousel.id + " > " + ".item").length;
      if (length < 2) return;
      item > 0 ? showItems(carousel, item - 1) : showItems(carousel, length - 1);
    }

    function currentItem(carousel) {
      return [...carousel.querySelectorAll("#" + carousel.id + " > " + ".item")].findIndex(
      item => item.style.display == "block");
    }

    function showItems(carousel, item) {
      let items = carousel.querySelectorAll("#" + carousel.id + " > " + ".item");
      let current = currentItem(carousel);
      items[current < 0 ? 0 : current].style.display = "none";
      items[item].style.display = "block";
      if (carousel.querySelector("#" + carousel.id + " > " + ".dots > .dot.active") != null)
      carousel.querySelector("#" + carousel.id + " > " + ".dots > .dot.active").classList.remove("active");
      carousel.querySelectorAll("#" + carousel.id + " > " + ".dots > .dot")[item].classList.add("active");
    }
}

function initLinks() {
    document.querySelectorAll( '.default-link').forEach( function( element ){
        if (element.tagName == 'A') {
            element.setAttribute( 'title', window.T_Open_link );
        }
    });
}

function initBigLinks() {
    document.querySelectorAll( '.big-link').forEach( function( element ){
        if (element.tagName == 'A') {
            element.setAttribute( 'title', window.T_Open_link );
        }
    });
}

function initTextClipboard() {
    document.querySelectorAll( '.copy').forEach( function( element ){
        element.setAttribute( 'title', window.T_Copy_to_clipboard );
    });
    var clip = new ClipboardJS('.copy');
    clip.on( 'success', function( e ){
        e.clearSelection();
        showNotify(window.T_Copied_to_clipboard,'<i class="fa-regular fa-clipboard"></i>');
    }); 
}

function showNotify(title, icon) {
   let notifyBox = document.getElementById("notifyBox");
   let notify = document.createElement("div");
   notify.classList.add("notify");
   let notifyIcon = document.createElement("div");
   notifyIcon.classList.add("icon");
   notifyIcon.innerHTML = icon;
   notify.appendChild(notifyIcon);
   let notifyTitle = document.createElement("div");
   notifyTitle.classList.add("title");
   notifyTitle.innerHTML = title;
   notify.appendChild(notifyTitle);
   notifyBox.appendChild(notify);
   setTimeout(() => {
    notify.classList.add("notify-out");
     setTimeout(() => {
        notify.remove();
    }, 500);
   }, 3000);
}

function initCodeClipboard(){
    function getCodeText( node ){
        // if highlight shortcode is used in inline lineno mode, remove lineno nodes before generating text, otherwise it doesn't hurt
        var code = node.cloneNode( true );
        Array.from( code.querySelectorAll( '*:scope > span > span:first-child:not(:last-child)' ) ).forEach( function( lineno ){
            lineno.remove();
        });
        var text = code.textContent;
        // remove a trailing line break, this may most likely
        // come from the browser / Hugo transformation
        text = text.replace( /\n$/, '' );
        return text;
    }

    function fallbackMessage( action ){
        var actionMsg = '';
        var actionKey = (action === 'cut' ? 'X' : 'C');
        if (/iPhone|iPad/i.test(navigator.userAgent)) {
            actionMsg = 'No support :(';
        }
        else if (/Mac/i.test(navigator.userAgent)) {
            actionMsg = 'Press ⌘-' + actionKey + ' to ' + action;
        }
        else {
            actionMsg = 'Press Ctrl-' + actionKey + ' to ' + action;
        }
        return actionMsg;
    }

    var codeElements = document.querySelectorAll( 'code' );
	for( var i = 0; i < codeElements.length; i++ ) {
        var code = codeElements[i];
        var text = getCodeText( code );
        var inPre = code.parentNode.tagName.toLowerCase() == 'pre';
        var inTable = inPre &&
            code.parentNode.parentNode.tagName.toLowerCase() == 'td';
        // avoid copy-to-clipboard for highlight shortcode in table lineno mode
        var isFirstLineCell = inTable &&
            code.parentNode.parentNode.parentNode.querySelector( 'td:first-child > pre > code' ) == code;
        if( !isFirstLineCell && ( inPre || text.length > 5 ) ){
            code.classList.add( 'copy-to-clipboard-code' );
            if( inPre ){
                code.classList.add( 'copy-to-clipboard' );
                code.parentNode.classList.add( 'pre-code' );
            }
            else{
                var clone = code.cloneNode( true );
                var span = document.createElement( 'span' );
                span.classList.add( 'copy-to-clipboard' );
                span.appendChild( clone );
                code.parentNode.replaceChild( span, code );
                code = clone;
            }
            var button = document.createElement( 'span' );
            button.classList.add( 'copy-to-clipboard-button' );
            button.setAttribute( 'title', window.T_Copy_to_clipboard );
            button.innerHTML = '<i class="far fa-copy"></i>';
            if( inTable ){
                var table = code.parentNode.parentNode.parentNode.parentNode.parentNode;
                table.dataset[ 'code' ] = text;
                table.parentNode.insertBefore( button, table.nextSibling );
            }
            else if( inPre ){
                var pre = code.parentNode;
                pre.dataset[ 'code' ] = text;
                var p = pre.parentNode;
                // indented code blocks are missing the div
                while( p != document && ( p.tagName.toLowerCase() != 'div' || !p.classList.contains( 'highlight' ) ) ){
                    p = p.parentNode;
                }
                if( p == document ){
                    var clone = pre.cloneNode( true );
                    var div = document.createElement( 'div' );
                    div.classList.add( 'highlight' );
                    div.appendChild( clone );
                    pre.parentNode.replaceChild( div, pre );
                    pre = clone;
                }
                pre.parentNode.insertBefore( button, pre.nextSibling );
            }
            else{
                code.dataset[ 'code' ] = text;
                code.parentNode.insertBefore( button, code.nextSibling );
            }
        }
    }
    
    var clip = new ClipboardJS( '.copy-to-clipboard-button', {
        text: function( trigger ){
            if( !trigger.previousElementSibling ){
                return '';
            }
            return trigger.previousElementSibling.dataset.code || '';
        }
    });

    clip.on( 'error', function( e ){
        var inPre = e.trigger.previousElementSibling && e.trigger.previousElementSibling.tagName.toLowerCase() == 'pre';
        var isCodeRtl = !inPre ? isRtl : false;
        var doBeside = inPre || (e.trigger.previousElementSibling && e.trigger.previousElementSibling.tagName.toLowerCase() == 'table' );
        e.trigger.setAttribute( 'aria-label', fallbackMessage(e.action) );
        e.trigger.classList.add( 'tooltipped', 'tooltipped-' + (doBeside ? 'w' : 's'+(isCodeRtl?'e':'w')) );
        var f = function(){
            e.trigger.setAttribute( 'aria-label', window.T_Copied_to_clipboard );
            e.trigger.classList.add( 'tooltipped', 'tooltipped-' + (doBeside ? 'w' : 's'+(isCodeRtl?'e':'w')) );
            document.removeEventListener( 'copy', f );
        };
        document.addEventListener( 'copy', f );
    });

    clip.on( 'success', function( e ){
        e.clearSelection();
        showNotify(window.T_Copied_to_clipboard,'<i class="fa-regular fa-clipboard"></i>');
    });
}

function initArrowNav(){
    if( isPrint ){
        return;
    }

    // button navigation
    var prev = document.querySelector( '.topbar-button-prev a' );
    prev && prev.addEventListener( 'click', navPrev );
    var next = document.querySelector( '.topbar-button-next a' );
    next && next.addEventListener( 'click', navNext );

    // keyboard navigation
    // avoid prev/next navigation if we are not at the start/end of the
    // horizontal area
    var el = document.querySelector('#R-body-inner');
    var scrollStart = 0;
    var scrollEnd = 0;
    document.addEventListener('keydown', function(event){
        if( !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey ){
            if( event.which == dir_key_start ){
                if( !scrollStart && +el.scrollLeft.toFixed()*dir_scroll <= 0 ){
                    prev && prev.click();
                }
                else if( scrollStart != -1 ){
                    clearTimeout( scrollStart );
                }
                scrollStart = -1;
            }
            if( event.which == dir_key_end ){
                if( !scrollEnd && +el.scrollLeft.toFixed()*dir_scroll + +el.clientWidth.toFixed() >= +el.scrollWidth.toFixed() ){
                    next && next.click();
                }
                else if( scrollEnd != -1 ){
                    clearTimeout( scrollEnd );
                }
                scrollEnd = -1;
            }
        }
    });
    document.addEventListener('keyup', function(event){
        if( !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey ){
            if( event.which == dir_key_start ){
                // check for false indication if keyup is delayed after navigation
                if( scrollStart == -1 ){
                    scrollStart = setTimeout( function(){ scrollStart = 0; }, 300 );
                }
            }
            if( event.which == dir_key_end ){
                if( scrollEnd == -1 ){
                    scrollEnd = setTimeout( function(){ scrollEnd = 0; }, 300 );
                }
            }
        }
    });

    // avoid keyboard navigation for input fields
    document.querySelectorAll( formelements ).forEach( function( e ){
        e.addEventListener( 'keydown', function( event ){
            if( event.which == dir_key_start || event.which == dir_key_end ){
                event.stopPropagation();
            }
        });
    });
}

function navShortcutHandler( event ){
    if( !event.shiftKey && event.altKey && event.ctrlKey && !event.metaKey && event.which == 78 /* n */ ){
        toggleNav();
    }
}

function searchShortcutHandler( event ){
    if( !event.shiftKey && event.altKey && event.ctrlKey && !event.metaKey && event.which == 70 /* f */ ){
        showSearch();
    }
}

function tocShortcutHandler( event ){
    if( !event.shiftKey && event.altKey && event.ctrlKey && !event.metaKey && event.which == 84 /* t */ ){
        toggleToc();
    }
}

function editShortcutHandler( event ){
    if( !event.shiftKey && event.altKey && event.ctrlKey && !event.metaKey && event.which == 87 /* w */ ){
        showEdit();
    }
}

function printShortcutHandler( event ){
    if( !event.shiftKey && event.altKey && event.ctrlKey && !event.metaKey && event.which == 80 /* p */ ){
        showPrint();
    }
}

function showSearch(){
    var s = document.querySelector( '#R-search-by' );
    if( !s ){
        return;
    }
    var b = document.querySelector( 'body' );
    if( s == document.activeElement ){
        if( b.classList.contains( 'sidebar-flyout' ) ){
            closeNav();
        }
        documentFocus();
    } else {
        if( !b.classList.contains( 'sidebar-flyout' ) ){
            openNav();
        }
        s.focus();
    }
}

function openNav(){
    closeSomeTopbarButtonFlyout();
    var b = document.querySelector( 'body' );
    b.classList.add( 'sidebar-flyout' );
    var a = document.querySelector( '#R-sidebar a' )
    if( a ){
        a.focus();
    }
}

function closeNav(){
    var b = document.querySelector( 'body' );
    b.classList.remove( 'sidebar-flyout' );
    documentFocus();
}

function toggleNav(){
    var b = document.querySelector( 'body' );
    if( b.classList.contains( 'sidebar-flyout' ) ){
        closeNav();
    }
    else{
        openNav();
    }
}

function navEscapeHandler( event ){
    if( event.key == "Escape" ){
        closeNav();
    }
}

function getTopbarButtonParent( e ){
    var button = e;
    while( button && !button.classList.contains( 'topbar-button' ) ){
        button = button.parentElement;
    }
    return button;
}

function openTopbarButtonFlyout( button ){
    closeNav();
    var body = document.querySelector( 'body' );
    button.classList.add( 'topbar-flyout' );
    body.classList.add( 'topbar-flyout' );
    var psb = pst.get( button );
    psb && setTimeout( function(){ psb.update(); }, 10 );
    psb && psb.scrollbarY.focus();
    var a = button.querySelector( '.topbar-content-wrapper a' );
    if( a ){
        a.focus();
    }
}

function closeTopbarButtonFlyout( button ){
    var body = document.querySelector( 'body' );
    button.classList.remove( 'topbar-flyout' );
    body.classList.remove( 'topbar-flyout' );
    documentFocus();
}

function closeSomeTopbarButtonFlyout(){
    var someButton = document.querySelector( '.topbar-button.topbar-flyout' );
    if( someButton ){
        closeTopbarButtonFlyout( someButton );
    };
    return someButton
}

function toggleTopbarButtonFlyout( button ){
    var someButton = closeSomeTopbarButtonFlyout();
    if( button && button != someButton ){
        openTopbarButtonFlyout( button );
    }
}

function toggleTopbarFlyout( e ){
    var button = getTopbarButtonParent( e );
    if( !button ){
        return;
    }
    toggleTopbarButtonFlyout( button );
}

function topbarFlyoutEscapeHandler( event ){
    if( event.key == "Escape" ){
        closeSomeTopbarButtonFlyout();
    }
}

function toggleToc(){
    toggleTopbarButtonFlyout( document.querySelector( '.topbar-button-toc' ) );
}

function showEdit(){
    var l = document.querySelector( '.topbar-button-edit a' );
    if( l ){
        l.click();
    }
}

function showPrint(){
    var l = document.querySelector( '.topbar-button-print a' );
    if( l ){
        l.click();
    }
}

function navPrev(){
    var e = document.querySelector( '.topbar-button-prev a' );
    location.href = e && e.getAttribute( 'href' );
};

function navNext(){
    var e = document.querySelector( '.topbar-button-next a' );
    location.href = e && e.getAttribute( 'href' );
};

function initToc(){
    if( isPrint ){
        return;
    }

    document.addEventListener( 'keydown', editShortcutHandler );
    document.addEventListener( 'keydown', navShortcutHandler );
    document.addEventListener( 'keydown', printShortcutHandler );
    document.addEventListener( 'keydown', searchShortcutHandler );
    document.addEventListener( 'keydown', tocShortcutHandler );
    document.addEventListener( 'keydown', navEscapeHandler );
    document.addEventListener( 'keydown', topbarFlyoutEscapeHandler );

    var b = document.querySelector( '#R-body-overlay' );
    if( b ){
        b.addEventListener( 'click', closeNav );
    }
    var m = document.querySelector( '#R-main-overlay' );
    if( m ){
        m.addEventListener( 'click', closeSomeTopbarButtonFlyout );
    }

    // finally give initial focus to allow keyboard scrolling in FF
    documentFocus();
}

function clearHistory() {
    var visitedItem = baseUriFull + 'visited-url/'
    for( var item in sessionStorage ){
        if( item.substring( 0, visitedItem.length ) === visitedItem ){
            sessionStorage.removeItem( item );
            var url = item.substring( visitedItem.length );
            // in case we have `relativeURLs=true` we have to strip the
            // relative path to root
            url = url.replace( /\.\.\//g, '/' ).replace( /^\/+\//, '/' );
            document.querySelectorAll( '[data-nav-id="'+url+'"]' ).forEach( function( e ){
                e.classList.remove( 'visited' );
            });
        }
    }
}

function initHistory() {
    var visitedItem = baseUriFull + 'visited-url/'
    sessionStorage.setItem( visitedItem+document.querySelector( 'body' ).dataset.url, 1);

    // loop through the sessionStorage and see if something should be marked as visited
    for( var item in sessionStorage ){
        if( item.substring( 0, visitedItem.length ) === visitedItem && sessionStorage.getItem( item ) == 1 ){
            var url = item.substring( visitedItem.length );
            // in case we have `relativeURLs=true` we have to strip the
            // relative path to root
            url = url.replace( /\.\.\//g, '/' ).replace( /^\/+\//, '/' );
            document.querySelectorAll( '[data-nav-id="'+url+'"]' ).forEach( function( e ){
                e.classList.add( 'visited' );
            });
        }
    }
    document.querySelectorAll("#R-topics li:not(.active):not(.alwaysopen)").forEach( function(el) {
       let input = el.querySelector("input");
       if (input != null) input.checked = sessionStorage.getItem(input.id) == 1;
    });
    window.addEventListener('beforeunload', function(e){
      document.querySelectorAll("#R-topics li:not(.alwaysopen)").forEach( function(el){
        let input = el.querySelector("input");
        if (input != null) input.checked == true ? sessionStorage.setItem(input.id,1) : sessionStorage.removeItem(input.id);
      });
    });
}

function initScrollPositionSaver(){
    function savePosition( event ){
        var state = window.history.state || {};
        state = Object.assign( {}, ( typeof state === 'object' ) ? state : {} );
        state.contentScrollTop = +elc.scrollTop;
        window.history.replaceState( state, '', window.location );
    };
    window.addEventListener( 'pagehide', savePosition );
}

function scrollToPositions() {
    // show active menu entry
    window.setTimeout( function(){
        var e = document.querySelector( '#R-sidebar li.active a' );
        if( e && e.scrollIntoView ){
            e.scrollIntoView({
                block: 'center',
            });
        }
    }, 10 );

    // scroll the content to point of interest;
    // if we have a scroll position saved, the user was here
    // before in his history stack and we want to reposition
    // to the position he was when he left the page;
    // otherwise if he used page search before, we want to position
    // to its last outcome;
    // otherwise he may want to see a specific fragment

    var state = window.history.state || {};
    state = ( typeof state === 'object')  ? state : {};
    if( state.hasOwnProperty( 'contentScrollTop' ) ){
        window.setTimeout( function(){
            elc.scrollTop = +state.contentScrollTop;
        }, 10 );
        return;
    }

    var search = sessionStorage.getItem( baseUriFull+'search-value' );
    if( search && search.length ){
        search = regexEscape( search );
        var found = elementContains( search, elc );
        var searchedElem = found.length && found[ 0 ];
        if( searchedElem ){
            searchedElem.scrollIntoView( true );
            var scrolledY = window.scrollY;
            if( scrolledY ){
                window.scroll( 0, scrolledY - 125 );
            }
        }
        return;
    }

    if( window.location.hash && window.location.hash.length > 1 ){
        window.setTimeout( function(){
            try{
                var e = document.querySelector( window.location.hash );
                if( e && e.scrollIntoView ){
                    e.scrollIntoView({
                        block: 'start',
                    });
                }
            } catch( e ){}
        }, 10 );
        return;
    }
}

function mark() {
	// mark some additional stuff as searchable
	var bodyInnerLinks = document.querySelectorAll( '#R-body-inner a:not(.lightbox-link):not(.btn):not(.lightbox-back)' );
	for( var i = 0; i < bodyInnerLinks.length; i++ ){
		bodyInnerLinks[i].classList.add( 'highlight' );
	}

	var value = sessionStorage.getItem( baseUriFull + 'search-value' );
    var highlightableElements = document.querySelectorAll( '.highlightable' );
    highlight( highlightableElements, value, { element: 'mark' } );

	var markedElements = document.querySelectorAll( 'mark' );
	for( var i = 0; i < markedElements.length; i++ ){
		var parent = markedElements[i].parentNode;
		while( parent && parent.classList ){
			if( parent.classList.contains( 'expand' ) ){
				var expandInputs = parent.querySelectorAll( 'input:not(.expand-marked)' );
				if( expandInputs.length ){
					expandInputs[0].classList.add( 'expand-marked' );
					expandInputs[0].dataset.checked = expandInputs[0].checked ? 'true' : 'false';
					expandInputs[0].checked = true;
				}
			}
			if( parent.tagName.toLowerCase() === 'li' && parent.parentNode && parent.parentNode.tagName.toLowerCase() === 'ul' && parent.parentNode.classList.contains( 'collapsible-menu' )){
				var toggleInputs = parent.querySelectorAll( 'input:not(.menu-marked)' );
				if( toggleInputs.length ){
					toggleInputs[0].classList.add( 'menu-marked' );
					toggleInputs[0].dataset.checked = toggleInputs[0].checked ? 'true' : 'false';
					toggleInputs[0].checked = true;
				}
			}
			parent = parent.parentNode;
		}
	}
}
window.relearn.markSearch = mark;

function highlight( es, words, options ){
    var settings = {
        className: 'highlight',
        element: 'span',
        caseSensitive: false,
        wordsOnly: false
    };
    Object.assign( settings, options );

    if( !words ){ return; }
    if( words.constructor === String ){
        words = [ words ];
    }
    words = words.filter( function( word, i ){
        return word != '';
    });
    words = words.map( function( word, i ){
        return regexEscape( word );
    });
    if( words.length == 0 ){ return this; }

    var flag = settings.caseSensitive ? '' : 'i';
    var pattern = "(" + words.join( '|' ) + ')';
    if( settings.wordsOnly ){
        pattern = '\\b' + pattern + '\\b';
    }
    var re = new RegExp( pattern, flag );

	for( var i = 0; i < es.length; i++ ){
        highlightNode( es[i], re, settings.element, settings.className );
	}
};

function highlightNode( node, re, nodeName, className ){
    if( node.nodeType === 3 && node.parentElement && node.parentElement.namespaceURI == 'http://www.w3.org/1999/xhtml' ) { // text nodes
        var match = node.data.match( re );
        if( match ){
            var highlight = document.createElement( nodeName || 'span' );
            highlight.className = className || 'highlight';
            var wordNode = node.splitText( match.index );
            wordNode.splitText( match[0].length );
            var wordClone = wordNode.cloneNode( true );
            highlight.appendChild( wordClone );
            wordNode.parentNode.replaceChild( highlight, wordNode );
            return 1; //skip added node in parent
        }
    } else if( (node.nodeType === 1 && node.childNodes) && // only element nodes that have children
        !/(script|style)/i.test(node.tagName) && // ignore script and style nodes
        !(node.tagName === nodeName.toUpperCase() && node.className === className) ){ // skip if already highlighted
        for( var i = 0; i < node.childNodes.length; i++ ){
            i += highlightNode( node.childNodes[i], re, nodeName, className );
        }
    }
    return 0;
};

function unmark() {
	sessionStorage.removeItem( baseUriFull + 'search-value' );
	var markedElements = document.querySelectorAll( 'mark' );
	for( var i = 0; i < markedElements.length; i++ ){
		var parent = markedElements[i].parentNode;
		while( parent && parent.classList ){
			if( parent.tagName.toLowerCase() === 'li' && parent.parentNode && parent.parentNode.tagName.toLowerCase() === 'ul' && parent.parentNode.classList.contains( 'collapsible-menu' )){
				var toggleInputs = parent.querySelectorAll( 'input.menu-marked' );
				if( toggleInputs.length ){
					toggleInputs[0].checked = toggleInputs[0].dataset.checked === 'true';
					toggleInputs[0].dataset.checked = null;
					toggleInputs[0].classList.remove( 'menu-marked' );
				}
			}
			if( parent.classList.contains( 'expand' ) ){
				var expandInputs = parent.querySelectorAll( 'input.expand-marked' );
				if( expandInputs.length ){
					expandInputs[0].checked = expandInputs[0].dataset.checked === 'true';
					expandInputs[0].dataset.checked = null;
					expandInputs[0].classList.remove( 'expand-marked' );
				}
			}
			parent = parent.parentNode;
		}
	}

	var highlighted = document.querySelectorAll( '.highlightable' );
    unhighlight( highlighted, { element: 'mark' } );
}

function unhighlight( es, options ){
    var settings = {
        className: 'highlight',
        element: 'span'
    };
    Object.assign( settings, options );

	for( var i = 0; i < es.length; i++ ){
        var highlightedElements = es[i].querySelectorAll( settings.element + '.' + settings.className );
        for( var j = 0; j < highlightedElements.length; j++ ){
            var parent = highlightedElements[j].parentNode;
            parent.replaceChild( highlightedElements[j].firstChild, highlightedElements[j] );
            parent.normalize();
        }
	}
};

// replace jQuery.createPseudo with https://stackoverflow.com/a/66318392
function elementContains( txt, e ){
    var regex = RegExp( txt, 'i' );
    var nodes = [];
    if( e ){
        var tree = document.createTreeWalker( e, 4 /* NodeFilter.SHOW_TEXT */, function( node ){
            return regex.test( node.data );
        }, false );
        var node = null;
        while( node = tree.nextNode() ){
            nodes.push( node.parentElement );
        }
    }
    return nodes;
}

function searchInputHandler( value ){
    unmark();
    if( value.length ){
        sessionStorage.setItem( baseUriFull+'search-value', value );
        mark();
    }
}

function initSearch() {
    // sync input/escape between searchbox and searchdetail
    var inputs = document.querySelectorAll( 'input.search-by' );
    inputs.forEach( function( e ){
        e.addEventListener( 'keydown', function( event ){
            if( event.key == 'Escape' ){
                var input = event.target;
                var search = sessionStorage.getItem( baseUriFull+'search-value' );
                if( !search || !search.length ){
                    input.blur();
                }
                searchInputHandler( '' );
                inputs.forEach( function( e ){
                    e.value = '';
                });
                if( !search || !search.length ){
                    documentFocus();
                }
            }
        });
        e.addEventListener( 'input', function( event ){
            var input = event.target;
            var value = input.value;
            searchInputHandler( value );
            inputs.forEach( function( e ){
                if( e != input ){
                    e.value = value;
                }
            });
        });
    });

    document.querySelectorAll( '[data-search-clear]' ).forEach( function( e ){
        e.addEventListener( 'click', function(){
            inputs.forEach( function( e ){
                e.value = '';
                var event = document.createEvent( 'Event' );
                event.initEvent( 'input', false, false );
                e.dispatchEvent( event );
            });
            unmark();
        });
    });

    var urlParams = new URLSearchParams( window.location.search );
    var value = urlParams.get( 'search-by' );
    if( value ){
        sessionStorage.setItem( baseUriFull+'search-value', value );
    }
    mark();

    // set initial search value for inputs on page load
    if( sessionStorage.getItem( baseUriFull+'search-value' ) ){
        var search = sessionStorage.getItem( baseUriFull+'search-value' );
        inputs.forEach( function( e ){
            e.value = search;
            var event = document.createEvent( 'Event' );
            event.initEvent( 'input', false, false );
            e.dispatchEvent( event );
        });
    }

    window.relearn.isSearchInit = true;
    window.relearn.runInitialSearch && window.relearn.runInitialSearch();
}

function updateTheme( detail ){
    if( window.relearn.lastVariant == detail.variant ){
        return;
    }
    window.relearn.lastVariant = detail.variant;

    initMermaid( true );
    initOpenapi( true );
    document.dispatchEvent( new CustomEvent( 'themeVariantLoaded', {
        detail: detail
    }));
}

function useMermaid( config ){
    if( !Object.assign ){
        // We don't support Mermaid for IE11 anyways, so bail out early
        return;
    }
    window.relearn.mermaidConfig = config;
    if (typeof mermaid != 'undefined' && typeof mermaid.mermaidAPI != 'undefined') {
        mermaid.initialize( Object.assign( { "securityLevel": "antiscript", "startOnLoad": false }, config ) );
        if( config.theme && variants ){
            var write_style = variants.findLoadedStylesheet( 'R-variant-style' );
            write_style.setProperty( '--CONFIG-MERMAID-theme', config.theme );
        }
    }
}
if( window.themeUseMermaid ){
    useMermaid( window.themeUseMermaid );
}

function useOpenapi( config ){
    if( config.css && config.css.startsWith( '/' ) ){
        config.css = baseUri + config.css;
    }
}
if( window.themeUseOpenapi ){
    useOpenapi( window.themeUseOpenapi );
}

ready( function(){
    initHistory(); 
    initArrowNav();
    initMermaid();
    initOpenapi();
    initToc();
    initAnchorClipboard();
    initTextClipboard();
    initMedia();
    initCarousels();
    initLinks();
    initBigLinks();
    initCodeClipboard();
    fixCodeTabs();
    restoreTabSelections();
    initSearch();
    initScrollPositionSaver();
    scrollToPositions();
});

   
(function(){
    var body = document.querySelector( 'body' );
    var topbar = document.querySelector( '#R-topbar' );
    function addTopbarButtonInfos(){
        // initially add some management infos to buttons and areas
        var areas = body.querySelectorAll( '.topbar-area' );
        areas.forEach( function( area ){
            area.dataset.area = 'area-' + area.dataset.area;
            var buttons = area.querySelectorAll( ':scope > .topbar-button' );
            buttons.forEach( function( button ){
                button.dataset.origin = area.dataset.area;
                button.dataset.action = 'show';
                var placeholder = document.createElement( 'div' );
                placeholder.classList.add( 'topbar-placeholder' );
                placeholder.dataset.action = 'show';
                button.insertAdjacentElement( 'afterend', placeholder );
            });
            var placeholder = document.createElement( 'div' );
            area.insertAdjacentElement( 'beforeend', placeholder );
            var hidden = document.createElement( 'div' );
            hidden.classList.add( 'topbar-hidden' );
            hidden.dataset.area = area.dataset.area;
            var hplaceholder = document.createElement( 'div' );
            hidden.insertAdjacentElement( 'beforeend', hplaceholder );
            area.insertAdjacentElement( 'afterend', hidden );
        });
    }
    function moveAreaTopbarButtons( width ){
        topbar.querySelectorAll( '.topbar-hidden .topbar-button' ).forEach( function( button ){
            // move hidden to origins area
            var placeholder = button.parentNode.parentNode.querySelector( ':scope > .topbar-area .topbar-placeholder[data-action="hide"]' );
            placeholder.dataset.action = 'show';
            button.dataset.action = 'show';
            placeholder.insertAdjacentElement( 'beforebegin', button );
        });
        topbar.querySelectorAll( '.topbar-area .topbar-button' ).forEach( function( button ){
            var current_area = button.dataset.action;
            var origin_area = button.dataset.origin;
            if( current_area != 'show' && origin_area != current_area ){
                // move moved to origins area
                var placeholder = topbar.querySelector( '.topbar-area[data-area="' + origin_area + '"] > .topbar-placeholder[data-action="' + current_area + '"]' );
                placeholder.dataset.action = 'show';
                button.dataset.action = 'show';
                placeholder.insertAdjacentElement( 'beforebegin', button );
            }
        });
        Array.from( topbar.querySelectorAll( '.topbar-area .topbar-button' ) ).reverse().forEach( function( button ){
            var parent = button.parentElement;
            var current_area = parent.dataset.area;
            var action = button.dataset[ 'width' + width.toUpperCase() ];
            if( action == 'show' ){
            }
            else if( action == 'hide' ){
                // move to origins hidden
                var hidden = button.parentNode.parentNode.querySelector( ':scope > .topbar-hidden > *' );
                var placeholder = button.nextSibling;
                placeholder.dataset.action = action;
                button.dataset.action = action;
                hidden.insertAdjacentElement( 'beforebegin', button );
            }
            else if( action != current_area ){
                // move to action area
                var dest = button.parentNode.parentNode.querySelector( '.topbar-area[data-area="' + action + '"] > *' );
                if( dest ){
                    var placeholder = button.nextSibling;
                    placeholder.dataset.action = action;
                    button.dataset.action = action;
                    dest.insertAdjacentElement( 'beforebegin', button );
                }
            }
        });
    }
    function moveTopbarButtons(){
        var isS = body.classList.contains( 'width-s' );
        var isM = body.classList.contains( 'width-m' );
        var isL = body.classList.contains( 'width-l' );
        // move buttons once, width has a distinct value
        if( isS && !isM && !isL ){
            moveAreaTopbarButtons( 's' )
        }
        else if( !isS && isM && !isL ){
            moveAreaTopbarButtons( 'm' )
        }
        else if( !isS && !isM && isL ){
            moveAreaTopbarButtons( 'l' )
        }
    }
    function adjustEmptyTopbarContents(){
        var buttons = Array.from( document.querySelectorAll( '.topbar-button > .topbar-content > .topbar-content-wrapper' ) );
        // we have to reverse order to make sure to handle innermost areas first
        buttons.reverse().forEach( function( wrapper ){
            var button = getTopbarButtonParent( wrapper );
            if( button ){
                var isEmpty = true;
                var area = wrapper.querySelector( ':scope > .topbar-area');
                if( area ){
                    // if it's an area, we have to check each contained button
                    // manually for its display property
                    var areabuttons = area.querySelectorAll( ':scope > .topbar-button' );
                    isEmpty = true;
                    areabuttons.forEach( function( ab ){
                        if( ab.style.display != 'none' ){
                            isEmpty = false;
                        }
                    })
                }
                else{
                    var clone = wrapper.cloneNode( true );
                    var irrelevant = clone.querySelectorAll( "div.ps__rail-x, div.ps__rail-y" );
                    irrelevant.forEach(function( e ) {
                        e.parentNode.removeChild( e );
                    });
                    isEmpty = !clone.innerHTML.trim();
                }
                button.querySelector( 'button' ).disabled = isEmpty;
                button.style.display = isEmpty && button.dataset.contentEmpty == 'hide' ? 'none' : 'inline-block';
            }
        })
    }
    function setWidthS(e){ body.classList[ e.matches ? "add" : "remove" ]( 'width-s' ); }
    function setWidthM(e){ body.classList[ e.matches ? "add" : "remove" ]( 'width-m' ); }
    function setWidthL(e){ body.classList[ e.matches ? "add" : "remove" ]( 'width-l' ); }
    function onWidthChange( setWidth, e ){
        setWidth( e );
        moveTopbarButtons();
        adjustEmptyTopbarContents();
    }
    var mqs = window.matchMedia( 'only screen and (max-width: 47.999rem)' );
    mqs.addEventListener( 'change', onWidthChange.bind( null, setWidthS ) );
    var mqm = window.matchMedia( 'only screen and (min-width: 48rem) and (max-width: 59.999rem)' );
    mqm.addEventListener( 'change', onWidthChange.bind( null, setWidthM ) );
    var mql = window.matchMedia( 'only screen and (min-width: 60rem)' );
    mql.addEventListener( 'change', onWidthChange.bind( null, setWidthL ) );

    addTopbarButtonInfos();
    setWidthS( mqs );
    setWidthM( mqm );
    setWidthL( mql );
    moveTopbarButtons();
    adjustEmptyTopbarContents();
})();
