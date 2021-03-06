import Ember from 'ember';

const {
  $,
  Mixin,
  String: { htmlSafe },
  RSVP: { Promise },
  computed,
  inject,
  run,
  K
} = Ember;

export default Mixin.create({
  constants: inject.service(),

  attributeBindings: ['translateStyle:style'],
  classNameBindings: ['transformIn:md-transition-in'],

  fromStyle: computed('defaultedOpenFrom', function() {
    return this.toTransformCss(this.calculateZoomToOrigin(this.element, this.get('defaultedOpenFrom')));
  }),

  centerStyle: computed(function() {
    return this.toTransformCss('');
  }),

  translateStyle: computed('fromStyle', 'centerStyle', 'transformStyleApply', function() {
    if (this.get('transformStyleApply') === 'from') {
      return htmlSafe(this.get('fromStyle'));
    } else if (this.get('transformStyleApply') === 'main') {
      return htmlSafe(this.get('centerStyle'));
    } else {
      return htmlSafe('');
    }
  }),

  init() {
    this._super(...arguments);
    this.TRANSITIONEND = this.get('constants').get('CSS').TRANSITIONEND;
  },

  onTranslateFromEnd: K,
  onTranslateToEnd: K,

  didInsertElement() {
    this._super(...arguments);

    run.schedule('afterRender', () => {
      // Set translate3d style to start at the `from` origin
      this.set('transformStyleApply', 'from');
      // Wait while CSS takes affect
      // Set the `main` styles and run the transition-in styles
      run.next(() => {
        this.waitTransitionEnd($(this.element)).then(() => {
          if (!this.get('isDestroying') && !this.get('isDestroyed')) {
            this.onTranslateFromEnd();
          }
        });
        if (!this.get('isDestroying') && !this.get('isDestroyed')) {
          this.set('transformStyleApply', 'main');
          this.set('transformIn', true);
        }
      });
    });
  },

  /**
   * Specific reversal of the request translate animation above...
   *
   * @protected
   */
  willDestroyElement() {
    this._super(...arguments);

    let containerClone = this.$().parent().clone();
    let dialogClone = containerClone.find('md-dialog');

    let toStyle = this.toTransformCss(this.calculateZoomToOrigin(this.element, this.get('defaultedCloseTo')));

    run.schedule('afterRender', () => {
      $(this.get('defaultedParent')).parent().append(containerClone);
      run.next(() => {
        dialogClone.removeClass('md-transition-in');
        dialogClone.addClass('md-transition-out');
        dialogClone.attr('style', toStyle);
        window.requestAnimationFrame(() => {
          this.waitTransitionEnd(dialogClone).then(() => {
            containerClone.remove();
            this.onTranslateToEnd($(this.get('origin')));
          });
        });
      });

    });
  },

  /**
   * Listen for transitionEnd event (with optional timeout)
   * Announce completion or failure via promise handlers
   *
   * @public
   */
  waitTransitionEnd($element) {

    // fallback is 3 secs
    return new Promise((resolve/*, reject*/) => {

      // Upon timeout or transitionEnd, reject or resolve (respectively) this promise.
      // NOTE: Make sure this transitionEnd didn't bubble up from a child
      $element.one(this.TRANSITIONEND, function(ev) {
        if (ev) {
          run(resolve);
        }
      });

    });
  },

  /**
   * Calculate the zoom transform from dialog to origin.
   *
   * We use this to set the dialog position immediately;
   * then the md-transition-in actually translates back to
   * `translate3d(0,0,0) scale(1.0)`...
   *
   * NOTE: all values are rounded to the nearest integer
   *
   * @public
   */
  calculateZoomToOrigin(element, originator) {
    let zoomStyle;

    if (originator) {
      originator = $(originator).get(0);
      let originBnds = this.copyRect(originator.getBoundingClientRect());
      let dialogRect = this.copyRect(element.getBoundingClientRect());
      let dialogCenterPt = this.centerPointFor(dialogRect);
      let originCenterPt = this.centerPointFor(originBnds);

      zoomStyle = {
        centerX: originCenterPt.x - dialogCenterPt.x,
        centerY: originCenterPt.y - dialogCenterPt.y,
        scaleX: Math.min(0.5, originBnds.width / dialogRect.width),
        scaleY: Math.min(0.5, originBnds.height / dialogRect.height)
      };
    } else {
      zoomStyle = { centerX: 0, centerY: 0, scaleX: 0.5, scaleY: 0.5 };
    }

    return `translate3d(${zoomStyle.centerX}px, ${zoomStyle.centerY}px, 0 ) scale(${zoomStyle.scaleX}, ${zoomStyle.scaleY})`;
  },

  /**
   * Convert the translate CSS value to key/value pair(s).
   *
   * @public
   */
  toTransformCss(transform, addTransition) {
    let styles = '';
    this.get('constants').get('CSS').TRANSFORM.split(' ').forEach((key) => {
      styles += `${key}:${transform};`;
    });

    if (addTransition) {
      styles += 'transform: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1) !important;';
    }

    return styles;
  },

  /**
   * Clone the Rect and calculate the height/width if needed
   *
   * @public
   */
  copyRect(source, destination) {
    if (!source) {
      return null;
    }

    destination = destination || {};

    'left top right bottom width height'.split(' ').forEach((key) => {
      destination[key] = Math.round(source[key]);
    });

    destination.width = destination.width || (destination.right - destination.left);
    destination.height = destination.height || (destination.bottom - destination.top);

    return destination;
  },

  /**
   * Calculate ClientRect of element; return null if hidden or zero size
   *
   * @public
   */
  clientRect(element) {
    let bounds = $(element)[0].getBoundingClientRect();

    // If the event origin element has zero size, it has probably been hidden.
    return bounds && (bounds.width > 0) && (bounds.height > 0) ? this.copyRect(bounds) : null;
  },

  /**
   * Calculate 'rounded' center point of Rect
   *
   * @public
   */
  centerPointFor(targetRect) {
    return {
      x: Math.round(targetRect.left + (targetRect.width / 2)),
      y: Math.round(targetRect.top + (targetRect.height / 2))
    };
  }

});
