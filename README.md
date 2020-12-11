# pangu-markdown-vscode README

基于 个人需要 定制的 Markdown Formatter

使用 Ctrl+Shift+P 打开 Command Pallete，输入 Pangu Format VSCode，就可以基于盘古的标准排版

## 盘古格式化标准

-   半角字符
    -   数字使用半角
    -   英文使用半角
    -   全角`( )`改成 半角`( )`，半角括号的两边都有空格
    -   英文和数字内部的全角标点`，。；『』「」：？！＠＃％＆－＝＋｛｝【】｜＼～`改成半角标点
        -，。；：？！改成半角后会在后边增加空格
        -   －＝＋｜＼％＆改成半角后会在两边增加空格
        -『』「」｛｝【】改成半角后会在两边增加空格
        -＠＃～改成半角后会取消两边的空格
    -   ^号不做调整，因为数学公式中需要使用，调整可能会出错
-   全角字符
    -   简体中文使用直角引号
    -   中文内部使用全角标点：`, \ . : ; ? !`改成`，、。：；？！`
-   全文约简
    -   删除连续超过两个的回车
-   加入空格
    -   在中文和英文之间加入空格
    -   在中文和数字之间加入空格，半角的% 视同数字
    -   在中文和`[]`之间加入空格
    -   链接之间使用空格
    -   數字與單位之間需要增加空格 ( 只有手工做，不能自动做，会破坏密码网址等信息 )
-   删除空格
    -   數字与度／百分比之間不需要增加空格 ( 去掉「100°」和「100%」中的空格 )
    -   将链接的格式中文括号「[] ( )」改成英文括号「[] ( )」，去掉增加的空格
    -   将网络地址中「://」符号改成「://」
    -   去掉 ( ) []{}<>'": 前后多余的空格
    -   去掉行末空格
    -   全角標點與其他字符之間不加空格
-   不重複使用標點符號
    -   截断连续超过一个的？和！为一个
    -   连续三个以上的`。`改成`......`, 例如:`……`to`......`
    -   连续的`。，；：、「」『』〖〗《》`只保留一个

## Markdown 格式化标准

-   Markdown 的格式匹配
    -   标题使用 atx-header
        -   标题的# 后面需要空格
        -   建议不出现重复标题
        -   建议不使用四级标题
    -   无编号列表使用`-`开头，`-`后面空一个空格
    -   缩进默认为 4 个空格
    -   程序中不会修改缩进，防止出现未知修改，导致内容层次出错，建议作者手工修改

## Features

-   基于 [盘古之白](https://github.com/vinta/pangu.js)
-   基于 [中文文案排版指北](https://github.com/sparanoid/chinese-copywriting-guidelines)
-   基于 [技术文档写作规范](https://www.jianshu.com/p/3b638180e42c)
-   基于 [Google Doc Guide](https://github.com/google/styleguide/tree/ab48617e00be9d111804bd3715dd7b5f5732c9a3/docguide)
-   方便与 Typora 的格式匹配
-   方便与 Pandoc 的格式匹配

## Requirements

## Extension Settings

## Known Issues

-   取消没有内容的括号中含有的空格，即 `func( )` 改成 `func()`
-   修正 list 后面跟网络地址或者图片地址时，排版错误

## Release Notes

### 0.1.5

-   增加了对中文夹代码块两边插入空格的支持

### 0.1.4

-   修正了数学公式中 $ () $ 中多余的空格，变成 $()$

### 0.1.3

-   取消了 formatMarkdown，将功能合并到 Pangu Format VSCode
-   取消了对缩进功能的支持，因为没有对 Markdown 解析，直接缩进会造成 Markdown 层次出错

### 0.1.1

-   基本功能已经做完
-   帮助也写完
-   测试文档也写完

未来计划

-   编写测试代码
