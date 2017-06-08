import {
    mxConstants
} from '../misc/mxExport.js';
import UIControl from './UIControl.js';

Image.prototype = new UIControl();
Image.prototype.constructor = Image;
window.Image = Image;

function Image(geometry) {

    //style in html5stencils.xml and registered in the editor
    var style = mxConstants.STYLE_SHAPE + '=image;' +
        mxConstants.STYLE_EDITABLE + "=0;";

    UIControl.call(this, geometry, style);
    this.setAttribute('src','');
    return this;
}
export default Image;