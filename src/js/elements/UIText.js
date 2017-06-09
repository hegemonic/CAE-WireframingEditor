/*global y*/
import {
    mxConstants
} from '../misc/mxExport.js';
import UIControl from './UIControl.js';
import $ from 'jquery';
import Y from 'yjs';

UIText.prototype = new UIControl();
UIText.prototype.constructor = UIText;
function UIText(text, geometry) {
    var style = mxConstants.STYLE_SHAPE + "=rectangle;" +
        mxConstants.STYLE_EDITABLE + "=0;" +
        mxConstants.STYLE_RESIZABLE + "=1;" +
        mxConstants.STYLE_FILLCOLOR + "=none;" +
        mxConstants.STYLE_STROKECOLOR + '=none;';

    UIControl.call(this, geometry, style);
    this.value.setAttribute('label', text);

    this.$input = null;

    this.init = function (element) {
        var dom = element || 'input';
        this.$input = $('<' + dom + '>')
            .css('width', this.geometry.width - 15)
            .css('height', this.geometry.height - 15)
            .css('font-size', 15);
    }

    return this;
}

UIText.prototype.initShared = function (createdByLocalUser) {
    UIControl.prototype.initShared.call(this, createdByLocalUser);
    if (createdByLocalUser) {
        var ytext = y.share.attrs.set(this.getId() + '_label', Y.Text);
        ytext.insert(0, this.value.getAttribute('label'));
    }
}
export default UIText;