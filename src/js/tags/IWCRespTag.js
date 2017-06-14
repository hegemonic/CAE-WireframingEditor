import {mxUtils, mxImage} from '../misc/mxExport.js';
import AbstractTag from './AbstractTag.js';
import CONST from '../misc/Constants.js';

mxUtils.extend(IWCRespTag, AbstractTag);
function IWCRespTag(offset){
    AbstractTag.call(this, new mxImage(CONST.IMAGES.IWC_RESP_TAG,CONST.TAG.SIZE, CONST.TAG.SIZE), 'IWC Response', offset);
}

export default IWCRespTag;