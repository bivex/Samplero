cmake_minimum_required(VERSION 3.22.1)

project(crypto_lib VERSION 0.1.0 LANGUAGES CXX)

add_library(samplero_crypto SHARED
    crypto.cpp
)

find_library(log-lib log)
target_link_libraries(samplero_crypto ${log-lib})
