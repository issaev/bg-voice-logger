<?php
if (!defined('ABSPATH')) { exit; }

/** Pure, fail-closed Drive scope checks. Only fixed reason codes leave this class. */
final class BVLOG_Direct_Scope {
    public static function valid_id($id){
        return is_string($id)&&preg_match('/^[A-Za-z0-9_-]{15,200}$/D',$id);
    }
    public static function document_reason($doc,$template){
        if(!self::valid_id($doc))return 'invalid_document_id';
        if($doc===$template)return 'template_document';
        return '';
    }
    public static function metadata_reason($file,$doc,$folder,$template){
        $reason=self::document_reason($doc,$template);
        if($reason!=='')return $reason;
        if(!is_array($file))return 'metadata_missing';
        if(($file['id']??null)!==$doc)return 'id_mismatch';
        if(($file['mimeType']??null)!=='application/vnd.google-apps.spreadsheet')return 'not_spreadsheet';
        if(!is_bool($file['trashed']??null))return 'trash_state_missing';
        if($file['trashed'])return 'trashed';
        if(!is_array($file['parents']??null)||!$file['parents'])return 'parents_missing';
        // Match GAS bvlDoc_: immediate parent only, never an ancestor or shortcut.
        if(!in_array($folder,$file['parents'],true))return 'parent_mismatch';
        if(!is_string($file['name']??null))return 'name_missing';
        if(preg_match('/^BVLOG_CREATE_PENDING_[a-f0-9-]{32,50}$/i',$file['name']))return 'pending_create';
        return '';
    }
}
